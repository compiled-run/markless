import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { exec } from './exec.ts';
import { simulatorRuntime, type SimctlRuntime } from './simulator-runtime.ts';
import { PROOF_APP_ID, PROOF_APP_NAME, PROOF_LINK_SCHEME } from './proof-app.ts';
import type { DeviceManifest } from '../permissions.ts';
import type { ProofAssets } from './rung.ts';
import { cachedFolder, cacheRoot, contentKey, filesUnder, SHELL_CACHE_FORMAT } from './tools.ts';
import { assertDragonPin, dragonDir } from '../style-export.ts';

export type BootedSimulator = {
	readonly udid: string;
	readonly name: string;
	readonly bootedHere: boolean;
};

type SimctlDevice = {
	readonly udid: string;
	readonly name: string;
	readonly state: string;
	readonly isAvailable: boolean;
};

const simctl = async (...args: string[]) => (await exec('xcrun', ['simctl', ...args])).stdout;

/** Finds the simulator called `name` (creating it on the newest iOS runtime that runs its device type when missing) and boots it unless it already runs. */
export async function bootSimulator(name: string): Promise<BootedSimulator> {
	const listed = JSON.parse(await simctl('list', 'devices', '--json')) as {
		devices: Record<string, ReadonlyArray<SimctlDevice>>;
	};
	let device = Object.values(listed.devices)
		.flat()
		.find((candidate) => candidate.name === name && candidate.isAvailable);
	if (!device) {
		const deviceType = process.env.MARKLESS_PROOF_IOS_DEVICE_TYPE ?? 'iPhone 17';
		const runtime = simulatorRuntime(
			(
				JSON.parse(await simctl('list', 'runtimes', '--json')) as {
					runtimes: SimctlRuntime[];
				}
			).runtimes,
			deviceType,
		);
		const udid = (await simctl('create', name, deviceType, runtime)).trim();
		device = { udid, name, state: 'Shutdown', isAvailable: true };
	}
	const bootedHere = device.state !== 'Booted';
	if (bootedHere) await exec('xcrun', ['simctl', 'boot', device.udid], { allowFailure: true });
	// A fresh simulator's first boot on a GitHub macOS runner took over 180 s (native-proofs run 44044321098).
	await exec('xcrun', ['simctl', 'bootstatus', device.udid, '-b'], { timeoutMs: 600_000 });
	return { udid: device.udid, name, bootedHere };
}

export async function shutdownSimulator(simulator: BootedSimulator): Promise<void> {
	if (simulator.bootedHere)
		await exec('xcrun', ['simctl', 'shutdown', simulator.udid], { allowFailure: true });
}

type PackageTarget = {
	readonly name: string;
	readonly path: string;
	readonly sources: ReadonlyArray<string>;
	readonly type: string;
	readonly target_dependencies?: ReadonlyArray<string>;
};

/** The package's library targets, each after the targets it depends on, as SwiftPM describes them. */
async function libraryTargets(packageDir: string) {
	const described = JSON.parse(
		(await exec('swift', ['package', 'describe', '--type', 'json'], { cwd: packageDir }))
			.stdout,
	) as {
		targets: ReadonlyArray<PackageTarget>;
		platforms?: ReadonlyArray<{ name: string; version: string }>;
	};
	const libraries = new Map(
		described.targets.filter((target) => target.type === 'library').map((t) => [t.name, t]),
	);
	const ordered: PackageTarget[] = [];
	const visit = (name: string, trail: ReadonlyArray<string>) => {
		if (ordered.some((target) => target.name === name)) return;
		if (trail.includes(name))
			throw new Error(
				`Swift targets depend on each other in a cycle: ${[...trail, name].join(' -> ')}`,
			);
		const target = libraries.get(name);
		if (!target)
			throw new Error(`Swift target ${name} is not a library target of ${packageDir}`);
		for (const dependency of target.target_dependencies ?? [])
			visit(dependency, [...trail, name]);
		ordered.push(target);
	};
	for (const name of libraries.keys()) visit(name, []);
	const ios = described.platforms?.find((platform) => platform.name === 'ios')?.version ?? '18.0';
	return { ordered, deploymentTarget: ios };
}

/**
 * Builds the shell app around a host Swift package (once per distinct source set): each library target becomes a static
 * module, then the shell links them. The payload is added per rung by `installProofApp`.
 */
export async function buildIosShell(hostPackage: string, shellDir: string): Promise<string> {
	const sdk = (
		await exec('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'])
	).stdout.trim();
	const dragon = dragonModules(hostPackage);
	const inputs = [...filesUnder(hostPackage, '.swift'), ...filesUnder(shellDir, '.swift')];
	const key = contentKey(hostPackage, inputs, [sdk, PROOF_APP_ID, SHELL_CACHE_FORMAT, infoPlist(''), dragon.key]);
	const root = await cachedFolder(join(cacheRoot(), 'ios-shell', key), async (scratch) => {
		const modules = join(scratch, 'modules');
		const app = join(scratch, `${PROOF_APP_NAME}.app`);
		mkdirSync(modules, { recursive: true });
		mkdirSync(app, { recursive: true });
		const { ordered, deploymentTarget } = await libraryTargets(hostPackage);
		const common = [
			'--sdk',
			'iphonesimulator',
			'swiftc',
			'-sdk',
			sdk,
			'-target',
			`arm64-apple-ios${deploymentTarget}-simulator`,
		];
		// Dragon's translated engine and its plan layout, before the host targets that import them.
		for (const target of dragon.modules) {
			await exec('xcrun', [
				...common,
				'-parse-as-library',
				'-wmo',
				'-O',
				'-module-name',
				target.name,
				'-emit-module',
				'-emit-module-path',
				join(modules, `${target.name}.swiftmodule`),
				'-emit-library',
				'-static',
				'-o',
				join(modules, `lib${target.name}.a`),
				'-I',
				modules,
				...target.sources,
			]);
		}
		for (const target of ordered) {
			await exec('xcrun', [
				...common,
				'-parse-as-library',
				'-wmo',
				'-module-name',
				target.name,
				'-emit-module',
				'-emit-module-path',
				join(modules, `${target.name}.swiftmodule`),
				'-emit-library',
				'-static',
				'-o',
				join(modules, `lib${target.name}.a`),
				'-I',
				modules,
				...target.sources.map((source) => join(hostPackage, target.path, source)),
			]);
		}
		await exec('xcrun', [
			...common,
			'-parse-as-library',
			'-I',
			modules,
			'-L',
			modules,
			...ordered.toReversed().map((target) => `-l${target.name}`),
			...dragon.modules.toReversed().map((target) => `-l${target.name}`),
			...filesUnder(shellDir, '.swift'),
			'-o',
			join(app, PROOF_APP_NAME),
		]);
		writeFileSync(join(app, 'Info.plist'), infoPlist(deploymentTarget));
	});
	return join(root, `${PROOF_APP_NAME}.app`);
}

/**
 * Dragon's translated layout engine (`DragonLayout`) and its Markless plan layout (`DragonPlan`: the translated harness, whose
 * entry point is internal, with this host's one-function glue), from the Dragon checkout the styles come from.
 */
function dragonModules(hostPackage: string) {
	assertDragonPin();
	const generated = join(dragonDir(), 'packages', 'layout', 'generated', 'swift', 'Sources');
	const engine = filesUnder(join(generated, 'DragonLayout'), '.swift');
	const harness = ['Harness.swift', 'Host.swift'].map((file) => join(generated, 'DragonLayoutHarness', file));
	if (engine.length === 0 || !harness.every((file) => existsSync(file)))
		throw new Error(`${generated} has no translated engine and harness; set MARKLESS_DRAGON_DIR to a Dragon checkout`);
	const glue = join(hostPackage, 'DragonPlan', 'DragonPlan.swift');
	return {
		key: contentKey(generated, [...engine, ...harness]),
		modules: [
			{ name: 'DragonLayout', sources: engine },
			{ name: 'DragonPlan', sources: [...harness, glue] },
		],
	};
}

const infoPlist = (minimumOs: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>${PROOF_APP_ID}</string>
<key>CFBundleExecutable</key><string>${PROOF_APP_NAME}</string>
<key>CFBundleName</key><string>${PROOF_APP_NAME}</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>MinimumOSVersion</key><string>${minimumOs}</string>
<key>UIDeviceFamily</key><array><integer>1</integer><integer>2</integer></array>
<key>UISupportedInterfaceOrientations</key><array><string>UIInterfaceOrientationPortrait</string><string>UIInterfaceOrientationLandscapeLeft</string><string>UIInterfaceOrientationLandscapeRight</string></array>
<key>UISupportedInterfaceOrientations~ipad</key><array><string>UIInterfaceOrientationPortrait</string><string>UIInterfaceOrientationPortraitUpsideDown</string><string>UIInterfaceOrientationLandscapeLeft</string><string>UIInterfaceOrientationLandscapeRight</string></array>
<key>UILaunchScreen</key><dict/>
<key>CFBundleSupportedPlatforms</key><array><string>iPhoneSimulator</string></array>
<key>UIApplicationSceneManifest</key><dict><key>UIApplicationSupportsMultipleScenes</key><false/></dict>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/><key>NSExceptionDomains</key><dict><key>127.0.0.1</key><dict><key>NSExceptionAllowsInsecureHTTPLoads</key><true/></dict></dict></dict>
<key>CFBundleURLTypes</key><array><dict><key>CFBundleURLName</key><string>${PROOF_APP_ID}</string><key>CFBundleURLSchemes</key><array><string>${PROOF_LINK_SCHEME}</string></array></dict></array>
</dict></plist>
`;

/** Copies the shell, adds the rung's payload (and style export and fonts), signs it ad hoc and installs it. */
export async function installProofApp(
	simulator: BootedSimulator,
	shellApp: string,
	assets: ProofAssets,
	manifest: DeviceManifest,
	workDir: string,
) {
	const app = join(workDir, `${PROOF_APP_NAME}.app`);
	rmSync(app, { recursive: true, force: true });
	cpSync(shellApp, app, { recursive: true });
	for (const { key, text } of manifest.ios)
		await exec('plutil', ['-insert', key, '-string', text, join(app, 'Info.plist')]);
	// MARKLESS_PROOF_ENGINE_WARM=0 builds an app whose script engine starts on first use only, to measure a cold start.
	if (process.env.MARKLESS_PROOF_ENGINE_WARM === '0')
		await exec('plutil', ['-insert', 'MarklessEngineWarm', '-bool', 'NO', join(app, 'Info.plist')]);
	for (const [path, bytes] of assets) {
		mkdirSync(join(app, path, '..'), { recursive: true });
		writeFileSync(join(app, path), bytes);
	}
	await exec('codesign', ['--force', '--sign', '-', app]);
	await exec('xcrun', ['simctl', 'install', simulator.udid, app], { timeoutMs: 300_000 });
}
