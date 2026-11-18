import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { androidLibraries } from './android-libraries.ts';
import { exec } from './exec.ts';
import {
	ANDROID_SHELL_ACTIVITY,
	PROOF_APP_ID,
	PROOF_APP_NAME,
	PROOF_LINK_SCHEME,
} from './proof-app.ts';
import type { DeviceManifest } from '../permissions.ts';
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
	const libraries = await androidLibraries(tools);
	const sources = [...filesUnder(hostSources, '.kt'), ...filesUnder(shellDir, '.kt')];
	const key = contentKey(hostSources, sources, [
		tools.buildTools,
		tools.androidJar,
		tools.kotlinStdlib,
		libraries.key,
		androidManifest([]),
	]);
	const root = join(cacheRoot(), 'android-shell', key);
	const dexDir = join(root, 'dex');
	const resources = join(root, 'resources.apk');
	const ids = join(root, 'resource-ids.txt');
	const shell = () => ({
		dex: filesUnder(dexDir, '.dex'),
		libraryResources: libraries.resources,
		rPackages: libraries.rPackages,
		ids,
	});
	if (existsSync(join(root, 'done'))) return shell();

	rmSync(root, { recursive: true, force: true });
	const classes = join(root, 'classes');
	const generated = join(root, 'r-java');
	mkdirSync(dexDir, { recursive: true });
	writeFileSync(join(root, 'AndroidManifest.xml'), androidManifest([]));
	await exec(join(tools.buildTools, 'aapt2'), [
		'link',
		'-o',
		resources,
		'-I',
		tools.androidJar,
		'--manifest',
		join(root, 'AndroidManifest.xml'),
		'--auto-add-overlay',
		...libraries.resources.flatMap((archive) => ['-R', archive]),
		'--extra-packages',
		libraries.rPackages.join(':'),
		'--java',
		generated,
		'--emit-ids',
		ids,
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
	await exec('kotlinc', ['-classpath', classpath, '-jvm-target', '17', '-nowarn', '-d', classes, ...sources]);
	await exec(join(tools.buildTools, 'd8'), [
		'--min-api',
		'26',
		'--output',
		dexDir,
		'--lib',
		tools.androidJar,
		...filesUnder(classes, '.class'),
		tools.kotlinStdlib,
		...libraries.jars,
	]);
	writeFileSync(join(root, 'done'), '');
	return shell();
}

const androidManifest = (
	permissions: ReadonlyArray<string>,
) => `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="${PROOF_APP_ID}" android:versionCode="1" android:versionName="1.0">
	<uses-sdk android:minSdkVersion="26" android:targetSdkVersion="36" />
${permissions.map((name) => `\t<uses-permission android:name="${name}" />\n`).join('')}
	<application android:label="${PROOF_APP_NAME}" android:hasCode="true">
		<activity android:name="${ANDROID_SHELL_ACTIVITY}" android:exported="true" android:theme="@android:style/Theme.Material.Light.NoActionBar" android:configChanges="orientation|screenSize|screenLayout|smallestScreenSize|keyboardHidden|uiMode">
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
	writeFileSync(join(workDir, 'AndroidManifest.xml'), androidManifest(manifest.android));
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
		'-A',
		assetDir,
	]);
	await exec('zip', ['-q', '-j', unsigned, ...shell.dex]);
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
