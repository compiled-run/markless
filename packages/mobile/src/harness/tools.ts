import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { exec } from './exec.ts';

export const ANDROID_PLATFORM = 'android-36';

export type AndroidTools = {
	readonly sdk: string;
	readonly adb: string;
	readonly emulator: string;
	readonly avdmanager: string;
	readonly buildTools: string;
	readonly androidJar: string;
	readonly kotlinStdlib: string;
	readonly systemImage: string;
};

export function cacheRoot(): string {
	return process.env.MARKLESS_PROOF_CACHE ?? join(homedir(), '.cache', 'markless-proof');
}

const need = (path: string, what: string): string => {
	if (!existsSync(path)) throw new Error(`${what} not found at ${path}`);
	return path;
};

async function kotlinStdlib(): Promise<string> {
	const home = process.env.KOTLIN_HOME;
	const candidates = home
		? [join(home, 'lib'), join(home, 'libexec', 'lib')]
		: await (async () => {
				const { stdout } = await exec('which', ['kotlinc']);
				const root = dirname(dirname(realpathSync(stdout.trim())));
				return [join(root, 'lib'), join(root, 'libexec', 'lib')];
			})();
	const found = candidates
		.map((folder) => join(folder, 'kotlin-stdlib.jar'))
		.find((jar) => existsSync(jar));
	if (!found)
		throw new Error(
			`kotlin-stdlib.jar not found in ${candidates.join(' or ')}; set KOTLIN_HOME`,
		);
	return found;
}

export async function androidTools(): Promise<AndroidTools> {
	const sdk =
		process.env.ANDROID_HOME ??
		process.env.ANDROID_SDK_ROOT ??
		join(homedir(), 'Library', 'Android', 'sdk');
	need(sdk, 'the Android SDK (set ANDROID_HOME)');
	const versions = readdirSync(need(join(sdk, 'build-tools'), 'Android build-tools')).sort(
		(a, b) => b.localeCompare(a, undefined, { numeric: true }),
	);
	if (versions.length === 0) throw new Error(`no Android build-tools under ${sdk}/build-tools`);
	return {
		sdk,
		adb: need(join(sdk, 'platform-tools', 'adb'), 'adb'),
		emulator: need(join(sdk, 'emulator', 'emulator'), 'the Android emulator'),
		avdmanager: need(join(sdk, 'cmdline-tools', 'latest', 'bin', 'avdmanager'), 'avdmanager'),
		buildTools: join(sdk, 'build-tools', versions[0]!),
		androidJar: need(
			join(sdk, 'platforms', ANDROID_PLATFORM, 'android.jar'),
			`the ${ANDROID_PLATFORM} platform`,
		),
		kotlinStdlib: await kotlinStdlib(),
		systemImage: `system-images;${ANDROID_PLATFORM};google_apis;${process.arch === 'arm64' ? 'arm64-v8a' : 'x86_64'}`,
	};
}

export function filesUnder(root: string, extension: string): string[] {
	if (!existsSync(root)) return [];
	return readdirSync(root, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(extension))
		.map((entry) => join(entry.parentPath, entry.name))
		.sort();
}

/** A cache key over input files (by path relative to `root` and content) plus any extra facts such as tool versions. */
export function contentKey(
	root: string,
	files: ReadonlyArray<string>,
	extra: ReadonlyArray<string> = [],
): string {
	const hash = createHash('sha256');
	for (const fact of extra) hash.update(`${fact}\0`);
	for (const file of files)
		hash.update(`${relative(root, file)}\0`)
			.update(readFileSync(file))
			.update('\0');
	return hash.digest('hex').slice(0, 24);
}
