import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { exec } from './exec.ts';
import { ANDROID_SHELL_ACTIVITY, PROOF_APP_ID, PROOF_APP_NAME } from './proof-app.ts';
import type { ProofAssets } from './rung.ts';
import { type AndroidTools, cacheRoot, contentKey, filesUnder } from './tools.ts';

export type BootedEmulator = {
	readonly serial: string;
	readonly avd: string;
	readonly bootedHere: boolean;
};

const adb = (tools: AndroidTools, serial: string, args: string[], timeoutMs = 120_000) =>
	exec(tools.adb, ['-s', serial, ...args], { timeoutMs });

async function waitForBoot(tools: AndroidTools, serial: string): Promise<void> {
	await adb(tools, serial, ['wait-for-device'], 180_000);
	await adb(
		tools,
		serial,
		['shell', 'while [ "$(getprop sys.boot_completed)" != 1 ]; do sleep 1; done'],
		300_000,
	);
}

/** Starts the AVD called `avd` on `port` (creating the AVD when missing) unless an emulator already serves that port. */
export async function bootEmulator(
	tools: AndroidTools,
	avd: string,
	port: number,
): Promise<BootedEmulator> {
	const serial = `emulator-${port}`;
	const running = await exec(tools.adb, ['-s', serial, 'get-state'], { allowFailure: true });
	const bootedHere = running.stdout.trim() !== 'device';
	if (bootedHere) {
		// avdmanager and the emulator disagree on the default AVD folder on some hosts (GitHub's Linux runners), so name it.
		const env = {
			...process.env,
			ANDROID_USER_HOME: process.env.ANDROID_USER_HOME ?? join(homedir(), '.android'),
			ANDROID_AVD_HOME:
				process.env.ANDROID_AVD_HOME ??
				join(process.env.ANDROID_USER_HOME ?? join(homedir(), '.android'), 'avd'),
		};
		const avds = (await exec(tools.emulator, ['-list-avds'], { env })).stdout
			.split('\n')
			.map((line) => line.trim());
		if (!avds.includes(avd)) {
			const child = spawn(
				tools.avdmanager,
				['create', 'avd', '-n', avd, '-k', tools.systemImage, '-d', 'pixel_7'],
				{ env },
			);
			child.stdin.end('no\n');
			await new Promise<void>((resolve, reject) =>
				child.on('close', (code) =>
					code === 0
						? resolve()
						: reject(new Error(`avdmanager could not create ${avd}`)),
				),
			);
		}
		const logFile = join(cacheRoot(), 'logs', `emulator-${port}.log`);
		mkdirSync(join(logFile, '..'), { recursive: true });
		const log = openSync(logFile, 'w');
		const emulator = spawn(
			tools.emulator,
			[
				'-avd',
				avd,
				'-port',
				String(port),
				'-no-window',
				'-no-audio',
				'-no-boot-anim',
				'-gpu',
				'swiftshader_indirect',
				'-no-snapshot',
			],
			{ detached: true, env, stdio: ['ignore', log, log] },
		);
		emulator.unref();
		const logTail = () => readFileSync(logFile, 'utf8').split('\n').slice(-40).join('\n');
		const exited = new Promise<{ readonly code: number | null }>((resolve) =>
			emulator.on('exit', (code) => resolve({ code })),
		);
		let ended: { readonly code: number | null } | undefined;
		try {
			ended = await Promise.race([waitForBoot(tools, serial).then(() => undefined), exited]);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`${message}\nthe emulator log ends:\n${logTail()}`);
		}
		if (ended)
			throw new Error(
				`the emulator exited (${ended.code}) before booting; its log ends:\n${logTail()}`,
			);
		return { serial, avd, bootedHere };
	}
	await waitForBoot(tools, serial);
	return { serial, avd, bootedHere };
}

export async function stopEmulator(tools: AndroidTools, emulator: BootedEmulator): Promise<void> {
	if (emulator.bootedHere)
		await exec(tools.adb, ['-s', emulator.serial, 'emu', 'kill'], { allowFailure: true });
}

/** Compiles the host's Kotlin sources with the shell activity to one classes.dex (once per distinct source set). */
/**
 * Proof only (handler-boundary.md): a folder with a JavaScript engine for `script` ops, its Java classes as `*.jar` and
 * its native libraries under `jni/<abi>/`, packed into the APK; and whether the shell starts it once idle.
 */
const proofEngine = () => process.env.MARKLESS_PROOF_ANDROID_ENGINE;
const proofEngineWarm = () => process.env.MARKLESS_PROOF_ENGINE_WARM === '1';
const EMULATOR_ABI = 'arm64-v8a';

export async function buildAndroidShell(
	tools: AndroidTools,
	hostSources: string,
	shellDir: string,
): Promise<string> {
	const sources = [...filesUnder(hostSources, '.kt'), ...filesUnder(shellDir, '.kt')];
	const engineJars = proofEngine() ? filesUnder(proofEngine()!, '.jar') : [];
	const key = contentKey(hostSources, [...sources, ...engineJars], [
		tools.buildTools,
		tools.androidJar,
		tools.kotlinStdlib,
	]);
	const root = join(cacheRoot(), 'android-shell', key);
	const dex = join(root, 'dex', 'classes.dex');
	if (existsSync(dex)) return dex;

	rmSync(root, { recursive: true, force: true });
	const classes = join(root, 'classes');
	mkdirSync(join(root, 'dex'), { recursive: true });
	await exec('kotlinc', [
		'-classpath',
		tools.androidJar,
		'-jvm-target',
		'17',
		'-nowarn',
		'-d',
		classes,
		...sources,
	]);
	await exec(join(tools.buildTools, 'd8'), [
		'--min-api',
		'26',
		'--output',
		join(root, 'dex'),
		'--lib',
		tools.androidJar,
		...filesUnder(classes, '.class'),
		tools.kotlinStdlib,
		...engineJars,
	]);
	return dex;
}

const manifest = () => `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="${PROOF_APP_ID}" android:versionCode="1" android:versionName="1.0">
	<uses-sdk android:minSdkVersion="26" android:targetSdkVersion="36" />
	<application android:label="${PROOF_APP_NAME}" android:hasCode="true">
		<activity android:name="${ANDROID_SHELL_ACTIVITY}" android:exported="true" android:theme="@android:style/Theme.Material.Light.NoActionBar">
			<intent-filter>
				<action android:name="android.intent.action.MAIN" />
				<category android:name="android.intent.category.LAUNCHER" />
			</intent-filter>
		</activity>
	</application>
</manifest>
`;

async function signingKey(): Promise<string> {
	const keystore = join(cacheRoot(), 'proof.keystore');
	if (existsSync(keystore)) return keystore;
	mkdirSync(cacheRoot(), { recursive: true });
	await exec('keytool', [
		'-genkeypair',
		'-keystore',
		keystore,
		'-storepass',
		'android',
		'-keypass',
		'android',
		'-alias',
		'proof',
		'-keyalg',
		'RSA',
		'-keysize',
		'2048',
		'-validity',
		'10000',
		'-dname',
		'CN=Markless Proof',
	]);
	return keystore;
}

/** Packs the shell's dex with the rung's payload (and style export and fonts) as assets, signs the APK and installs it. */
export async function installProofApk(
	tools: AndroidTools,
	emulator: BootedEmulator,
	dex: string,
	assets: ProofAssets,
	workDir: string,
) {
	const assetDir = join(workDir, 'assets');
	rmSync(workDir, { recursive: true, force: true });
	mkdirSync(assetDir, { recursive: true });
	for (const [path, bytes] of assets) {
		mkdirSync(join(assetDir, path, '..'), { recursive: true });
		writeFileSync(join(assetDir, path), bytes);
	}
	if (proofEngineWarm()) writeFileSync(join(assetDir, 'markless', 'warm-engine'), '');
	writeFileSync(join(workDir, 'AndroidManifest.xml'), manifest());
	const unsigned = join(workDir, 'unsigned.apk');
	const aligned = join(workDir, 'aligned.apk');
	const apk = join(workDir, `${PROOF_APP_NAME}.apk`);
	await exec(join(tools.buildTools, 'aapt2'), [
		'link',
		'-o',
		unsigned,
		'-I',
		tools.androidJar,
		'--manifest',
		join(workDir, 'AndroidManifest.xml'),
		'-A',
		assetDir,
	]);
	await exec('zip', ['-q', '-j', unsigned, dex]);
	const engine = proofEngine();
	if (engine) {
		const libs = join(workDir, 'native');
		mkdirSync(join(libs, 'lib', EMULATOR_ABI), { recursive: true });
		for (const library of filesUnder(join(engine, 'jni', EMULATOR_ABI), '.so'))
			writeFileSync(join(libs, 'lib', EMULATOR_ABI, library.split('/').pop()!), readFileSync(library));
		await exec('zip', ['-q', '-r', unsigned, 'lib'], { cwd: libs });
	}
	await exec(join(tools.buildTools, 'zipalign'), ['-f', '4', unsigned, aligned]);
	await exec(join(tools.buildTools, 'apksigner'), [
		'sign',
		'--ks',
		await signingKey(),
		'--ks-pass',
		'pass:android',
		'--out',
		apk,
		aligned,
	]);
	console.log(`android apk ${statSync(apk).size} bytes${engine ? ` with the engine in ${engine}` : ''}`);
	await exec(tools.adb, ['-s', emulator.serial, 'uninstall', PROOF_APP_ID], {
		allowFailure: true,
	});
	await adb(tools, emulator.serial, ['install', '--no-incremental', apk]);
}
