import { spawn } from 'node:child_process';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	NATIVE_APP_VERSION,
	type NativeAppPayload,
	type NativeScript,
	type NativeViewPayload,
} from '@markless/serializer/native-view';
import { androidLibraries } from './android-libraries.ts';
import { focusedWindowIn, waitButtonIn } from './emulator-screen.ts';
import { exec } from './exec.ts';
import {
	ANDROID_SHELL_ACTIVITY,
	PROOF_APP_ID,
	PROOF_APP_NAME,
	PROOF_LINK_SCHEME,
	PROOF_PAYLOAD_PATH,
	stylesShapeText,
} from './proof-app.ts';
import type { DeviceManifest } from '../permissions.ts';
import type { ProofAssets } from './rung.ts';
import {
	type AndroidTools,
	cachedFolder,
	cacheRoot,
	contentKey,
	filesUnder,
	SHELL_CACHE_FORMAT,
} from './tools.ts';
import { assertDragonPin, dragonDir } from '../style-export.ts';

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

/** Whether the emulator still answers: an adb `device` that finished booting. */
export async function emulatorAnswers(tools: AndroidTools, serial: string): Promise<boolean> {
	const booted = await exec(tools.adb, ['-s', serial, 'shell', 'getprop', 'sys.boot_completed'], {
		allowFailure: true,
		timeoutMs: 20_000,
	}).catch(() => ({ code: 1, stdout: '' }));
	return booted.code === 0 && booted.stdout.trim() === '1';
}

const shell = (tools: AndroidTools, serial: string, command: string) =>
	exec(tools.adb, ['-s', serial, 'shell', command], { allowFailure: true, timeoutMs: 20_000 })
		.then((result) => (result.code === 0 ? result.stdout : undefined))
		.catch(() => undefined);

/** Presses the "Wait" button of a not-responding dialog; Back when the screen cannot be read. */
async function waitOutNotResponding(tools: AndroidTools, serial: string): Promise<void> {
	const screen = await shell(
		tools,
		serial,
		'uiautomator dump /data/local/tmp/settle.xml >/dev/null && cat /data/local/tmp/settle.xml',
	);
	const wait = screen === undefined ? undefined : waitButtonIn(screen);
	await shell(
		tools,
		serial,
		wait ? `input tap ${wait.x} ${wait.y}` : 'input keyevent KEYCODE_BACK',
	);
}

/**
 * Waits until the emulator answers and an ordinary window holds focus on two reads in a row, waiting out any
 * "isn't responding" dialog meanwhile: on a loaded CI runner System UI can stall after boot and its dialog then covers every page.
 */
export async function settleEmulator(
	tools: AndroidTools,
	serial: string,
	timeoutMs = 180_000,
): Promise<{ readonly dismissed: number }> {
	const deadline = Date.now() + timeoutMs;
	let dismissed = 0;
	let calm = 0;
	let last = 'no answer';
	while (Date.now() < deadline) {
		const windows = (await emulatorAnswers(tools, serial))
			? await shell(tools, serial, 'dumpsys window displays')
			: undefined;
		const focus = windows === undefined ? undefined : focusedWindowIn(windows);
		last = focus ?? 'no focused window';
		if (focus?.includes('Application Not Responding')) {
			calm = 0;
			dismissed++;
			await waitOutNotResponding(tools, serial);
		} else if (focus) {
			if (++calm === 2) return { dismissed };
		} else calm = 0;
		await new Promise((resolve) => setTimeout(resolve, calm > 0 ? 2000 : 3000));
	}
	throw new Error(
		`${serial} did not settle in ${timeoutMs / 1000} s (focus: ${last}; not-responding dialogs waited out: ${dismissed})`,
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
		await settleEmulator(tools, serial);
		return { serial, avd, bootedHere };
	}
	await waitForBoot(tools, serial);
	await settleEmulator(tools, serial);
	return { serial, avd, bootedHere };
}

export async function stopEmulator(tools: AndroidTools, emulator: BootedEmulator): Promise<void> {
	if (emulator.bootedHere)
		await exec(tools.adb, ['-s', emulator.serial, 'emu', 'kill'], { allowFailure: true });
}

/** The shell built once per source set: its dex files and the linked resources (the libraries' with the manifest) every rung's APK starts from. */
export type AndroidShell = {
	readonly dex: ReadonlyArray<string>;
	/** The libraries' compiled resources and their R packages, linked again per rung with that rung's manifest. */
	readonly libraryResources: ReadonlyArray<string>;
	readonly rPackages: ReadonlyArray<string>;
	/** The resource ids the shell's R classes were compiled against; every rung's link keeps them. */
	readonly ids: string;
};

/** Links the libraries' resources, compiles their R classes and the host's Kotlin sources with the shell activity, and dexes it all. */
export async function buildAndroidShell(
	tools: AndroidTools,
	hostSources: string,
	shellDir: string,
): Promise<AndroidShell> {
	const hostLock = join(hostSources, '..', 'libraries.lock.json');
	const libraries = await androidLibraries(tools, existsSync(hostLock) ? hostLock : undefined);
	const dragon = dragonKotlin();
	const sources = [...filesUnder(hostSources, '.kt'), ...filesUnder(shellDir, '.kt')];
	const key = contentKey(hostSources, sources, [
		dragon.key,
		tools.buildTools,
		tools.androidJar,
		tools.kotlinStdlib,
		libraries.key,
		androidManifest([]),
		SHELL_CACHE_FORMAT,
	]);
	const root = await cachedFolder(join(cacheRoot(), 'android-shell', key), async (scratch) => {
		const classes = join(scratch, 'classes');
		const generated = join(scratch, 'r-java');
		mkdirSync(join(scratch, 'dex'), { recursive: true });
		writeFileSync(join(scratch, 'AndroidManifest.xml'), androidManifest([]));
		await exec(join(tools.buildTools, 'aapt2'), [
			'link',
			'-o',
			join(scratch, 'resources.apk'),
			'-I',
			tools.androidJar,
			'--manifest',
			join(scratch, 'AndroidManifest.xml'),
			'--auto-add-overlay',
			...libraries.resources.flatMap((archive) => ['-R', archive]),
			'--extra-packages',
			libraries.rPackages.join(':'),
			'--java',
			generated,
			'--emit-ids',
			join(scratch, 'resource-ids.txt'),
		]);
		await exec('javac', [
			'--release',
			'11',
			'-nowarn',
			'-d',
			classes,
			...filesUnder(generated, '.java'),
		]);
		const classpath = [tools.androidJar, classes, ...libraries.jars].join(':');
		await exec('kotlinc', [
			'-classpath',
			classpath,
			'-jvm-target',
			'17',
			'-nowarn',
			'-d',
			classes,
			...sources,
			...dragon.sources,
		]);
		await exec(join(tools.buildTools, 'd8'), [
			'--min-api',
			'26',
			'--output',
			join(scratch, 'dex'),
			'--lib',
			tools.androidJar,
			...filesUnder(classes, '.class'),
			tools.kotlinStdlib,
			...libraries.jars,
		]);
	});
	return {
		dex: filesUnder(join(root, 'dex'), '.dex'),
		libraryResources: libraries.resources,
		rPackages: libraries.rPackages,
		ids: join(root, 'resource-ids.txt'),
	};
}

/** The Hermes engine folder: `build-hermes.sh`, its lock, and the sources it compiles. */
const ANDROID_ENGINE_DIR = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'../adapters/android/engine',
);

/** A test-build asset: `0` turns off warming the engine at idle, so the first entry starts it (cold). */
const ENGINE_WARM_ASSET = 'markless/engine-warm';

/** The network security config a build whose script fetches gets: cleartext to the test's 127.0.0.1 server only. */
const NETWORK_CONFIG = 'markless_network';
const networkConfig = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
	<domain-config cleartextTrafficPermitted="true">
		<domain includeSubdomains="false">127.0.0.1</domain>
	</domain-config>
</network-security-config>
`;

/** The scripts the build's payload runs: a page's, or each page's of an app. */
function payloadScripts(assets: ProofAssets): NativeScript[] {
	const bytes = assets.get(PROOF_PAYLOAD_PATH);
	if (!bytes) return [];
	const payload = JSON.parse(new TextDecoder().decode(bytes)) as
		| NativeViewPayload
		| NativeAppPayload;
	const pages =
		payload.version === NATIVE_APP_VERSION ? payload.routes.map((route) => route.page) : [payload];
	return pages.flatMap((page) => (page.script ? [page.script] : []));
}

/** The one ABI the proof APK carries the engine for: the emulator's, which is the Mac's. */
const engineAbi = () => (process.arch === 'arm64' ? 'arm64-v8a' : 'x86_64');

/** The engine folder built by `build-hermes.sh` (cached by its lock and sources) and its classes dexed. */
async function androidEngine(
	tools: AndroidTools,
): Promise<{ readonly dex: ReadonlyArray<string>; readonly libraries: ReadonlyArray<string> }> {
	const abi = engineAbi();
	const sources = [
		...filesUnder(ANDROID_ENGINE_DIR, '.json'),
		...filesUnder(ANDROID_ENGINE_DIR, '.sh'),
		...filesUnder(ANDROID_ENGINE_DIR, '.kt'),
		...filesUnder(ANDROID_ENGINE_DIR, '.cpp'),
	];
	const key = contentKey(ANDROID_ENGINE_DIR, sources, [
		abi,
		tools.buildTools,
		tools.androidJar,
		tools.kotlinStdlib,
	]);
	const root = join(cacheRoot(), 'android-engine', key);
	const folder = join(root, 'engine');
	const dexDir = join(root, 'dex');
	const engine = () => ({
		dex: filesUnder(dexDir, '.dex'),
		libraries: filesUnder(join(folder, 'jni', abi), '.so'),
	});
	if (existsSync(join(root, 'done'))) return engine();
	rmSync(root, { recursive: true, force: true });
	mkdirSync(dexDir, { recursive: true });
	await exec('sh', [join(ANDROID_ENGINE_DIR, 'build-hermes.sh'), folder, abi], {
		env: { ...process.env, ANDROID_HOME: tools.sdk, MARKLESS_PROOF_CACHE: cacheRoot() },
		timeoutMs: 1_800_000,
	});
	await exec(join(tools.buildTools, 'd8'), [
		'--min-api',
		'26',
		'--output',
		dexDir,
		'--lib',
		tools.androidJar,
		'--classpath',
		tools.kotlinStdlib,
		join(folder, 'classes.jar'),
	]);
	writeFileSync(join(root, 'done'), '');
	return engine();
}

/**
 * Dragon's translated layout engine and its Markless plan layout (the translated harness without its command-line `main`), from
 * the Dragon checkout the styles come from; the host finds `dev.dragon.layout.HarnessKt` by name.
 */
function dragonKotlin() {
	assertDragonPin();
	const generated = join(dragonDir(), 'packages', 'layout', 'generated', 'kotlin');
	const engine = filesUnder(join(generated, 'src', 'main', 'kotlin', 'dev', 'dragon', 'layout'), '.kt');
	const harness = ['Harness.kt', 'Host.kt'].map((file) => join(generated, 'harness', 'dev', 'dragon', 'layout', file));
	// Dragon's HarfBuzz shim's Kotlin side: a styled list's rows shape their text on the phone as the build shapes Android's faces.
	const shim = join(dragonDir(), 'packages', 'text-shaper', 'kotlin', 'src', 'dev', 'dragon', 'text', 'DragonHB.kt');
	if (engine.length === 0 || !harness.every((file) => existsSync(file)) || !existsSync(shim))
		throw new Error(`${generated} has no translated engine and harness; set MARKLESS_DRAGON_DIR to a Dragon checkout`);
	const sources = [...engine, ...harness, shim];
	return { key: contentKey(generated, sources), sources };
}


/**
 * Dragon's HarfBuzz shim for the emulator's ABI (`libdragon_hb.so`, with its JNI glue), built from the Dragon checkout with Zig
 * 0.16 (MARKLESS_ZIG, else `zig` on the PATH) and the SDK's NDK, cached by the Dragon commit and the ABI.
 */
async function dragonHarfBuzz(tools: AndroidTools): Promise<string> {
	assertDragonPin();
	const shaper = join(dragonDir(), 'packages', 'text-shaper');
	const abi = engineAbi();
	const ndks = join(tools.sdk, 'ndk');
	const ndk = existsSync(ndks)
		? readdirSync(ndks).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0]
		: undefined;
	if (!ndk) throw new Error(`no NDK under ${ndks}: a styled list's rows need Dragon's HarfBuzz shim built for Android`);
	const sources = [...filesUnder(join(shaper, 'src'), '.zig'), join(shaper, 'build.zig'), join(shaper, 'build.zig.zon')];
	const key = contentKey(shaper, sources, [abi, ndk]);
	const root = await cachedFolder(join(cacheRoot(), 'dragon-hb', key), async (scratch) => {
		await exec(process.env.MARKLESS_ZIG ?? 'zig', ['build', 'android', `-Dandroid-ndk=${join(ndks, ndk)}`, '--prefix', scratch], { cwd: shaper });
	});
	const library = join(root, 'android', abi, 'libdragon_hb.so');
	if (!existsSync(library)) throw new Error(`the Zig build of Dragon's shim made no ${library}`);
	return library;
}

const androidManifest = (
	permissions: ReadonlyArray<string>,
	cleartextToTestServer = false,
) => `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="${PROOF_APP_ID}" android:versionCode="1" android:versionName="1.0">
	<uses-sdk android:minSdkVersion="26" android:targetSdkVersion="36" />
${permissions.map((name) => `\t<uses-permission android:name="${name}" />\n`).join('')}
	<application android:label="${PROOF_APP_NAME}" android:hasCode="true"${cleartextToTestServer ? ` android:networkSecurityConfig="@xml/${NETWORK_CONFIG}"` : ''}>
		<activity android:name="${ANDROID_SHELL_ACTIVITY}" android:exported="true" android:windowSoftInputMode="adjustResize" android:theme="@android:style/Theme.Material.Light.NoActionBar" android:configChanges="orientation|screenSize|screenLayout|smallestScreenSize|keyboardHidden|uiMode">
			<intent-filter>
				<action android:name="android.intent.action.MAIN" />
				<category android:name="android.intent.category.LAUNCHER" />
			</intent-filter>
			<intent-filter>
				<action android:name="android.intent.action.VIEW" />
				<category android:name="android.intent.category.DEFAULT" />
				<category android:name="android.intent.category.BROWSABLE" />
				<data android:scheme="${PROOF_LINK_SCHEME}" />
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

/** Packs the shell's resources and dex with the rung's payload (and style export and fonts) as assets and signs the APK. */
export async function packProofApk(
	tools: AndroidTools,
	shell: AndroidShell,
	assets: ProofAssets,
	manifest: DeviceManifest,
	workDir: string,
): Promise<string> {
	const assetDir = join(workDir, 'assets');
	rmSync(workDir, { recursive: true, force: true });
	mkdirSync(assetDir, { recursive: true });
	for (const [path, bytes] of assets) {
		mkdirSync(join(assetDir, path, '..'), { recursive: true });
		writeFileSync(join(assetDir, path), bytes);
	}
	// The engine ships only in an APK whose payload has a script; one that fetches may reach the test's server.
	const scripts = payloadScripts(assets);
	const fetches = scripts.some((script) => script.services.includes('fetch'));
	if (scripts.length > 0 && process.env.MARKLESS_PROOF_ENGINE_WARM === '0')
		writeFileSync(join(assetDir, ENGINE_WARM_ASSET), '0');
	const permissions = [
		...new Set([...manifest.android, ...(fetches ? ['android.permission.INTERNET'] : [])]),
	];
	writeFileSync(
		join(workDir, 'AndroidManifest.xml'),
		androidManifest(permissions, fetches),
	);
	const networkResources: string[] = [];
	if (fetches) {
		const xml = join(workDir, 'res', 'xml', `${NETWORK_CONFIG}.xml`);
		mkdirSync(dirname(xml), { recursive: true });
		writeFileSync(xml, networkConfig);
		const compiled = join(workDir, 'compiled');
		mkdirSync(compiled, { recursive: true });
		await exec(join(tools.buildTools, 'aapt2'), ['compile', '-o', compiled, xml]);
		networkResources.push(...filesUnder(compiled, '.flat'));
	}
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
		'--auto-add-overlay',
		...shell.libraryResources.flatMap((archive) => ['-R', archive]),
		'--extra-packages',
		shell.rPackages.join(':'),
		'--stable-ids',
		shell.ids,
		...networkResources.flatMap((flat) => ['-R', flat]),
		'-A',
		assetDir,
	]);
	await exec('zip', ['-q', '-j', unsigned, ...shell.dex]);
	if (stylesShapeText(assets)) {
		const staged = join(workDir, 'shaper');
		mkdirSync(join(staged, 'lib', engineAbi()), { recursive: true });
		copyFileSync(await dragonHarfBuzz(tools), join(staged, 'lib', engineAbi(), 'libdragon_hb.so'));
		await exec('zip', ['-q', '-r', unsigned, 'lib'], { cwd: staged });
	}
	if (scripts.length > 0) {
		const engine = await androidEngine(tools);
		const staged = join(workDir, 'engine');
		const libDir = join(staged, 'lib', engineAbi());
		mkdirSync(libDir, { recursive: true });
		// The engine's dex files follow the shell's: classes<N+1>.dex onwards.
		const dex = engine.dex.map((file, index) => {
			const target = join(staged, `classes${shell.dex.length + index + 1}.dex`);
			copyFileSync(file, target);
			return target;
		});
		for (const library of engine.libraries) copyFileSync(library, join(libDir, basename(library)));
		await exec('zip', ['-q', '-j', unsigned, ...dex]);
		await exec('zip', ['-q', '-r', unsigned, 'lib'], { cwd: staged });
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
	return apk;
}

/** Packs the rung's APK ([packProofApk]) and installs it in place of any earlier proof app. */
export async function installProofApk(
	tools: AndroidTools,
	emulator: BootedEmulator,
	shell: AndroidShell,
	assets: ProofAssets,
	manifest: DeviceManifest,
	workDir: string,
) {
	const apk = await packProofApk(tools, shell, assets, manifest, workDir);
	await exec(tools.adb, ['-s', emulator.serial, 'uninstall', PROOF_APP_ID], {
		allowFailure: true,
	});
	await adb(tools, emulator.serial, ['install', '--no-incremental', apk]);
}
