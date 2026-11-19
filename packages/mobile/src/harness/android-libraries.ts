import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from './exec.ts';
import {
	type AndroidTools,
	androidTools,
	cachedFolder,
	cacheRoot,
	filesUnder,
	SHELL_CACHE_FORMAT,
} from './tools.ts';

export const ANDROID_LIBRARIES_LOCK = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'../adapters/android/libraries.lock.json',
);
const LOCK_VERSION = 'markless.android-libraries/0';

type LockedArtifact = {
	readonly coordinate: string;
	readonly url: string;
	readonly sha256: string;
	/** An AAR's manifest package: the R class its code reads. */
	readonly package?: string;
	readonly resources?: boolean;
	readonly rClass?: boolean;
	/** Stood in for by the Kotlin toolchain's own stdlib: never downloaded or dexed. */
	readonly toolchain?: boolean;
};

/** The host's libraries, ready for a build: jars for the classpath and dex, compiled resources in overlay order, R packages. */
export type AndroidLibraries = {
	readonly jars: ReadonlyArray<string>;
	/** aapt2 compiled resource archives, dependencies before the libraries that use them. */
	readonly resources: ReadonlyArray<string>;
	readonly rPackages: ReadonlyArray<string>;
	/** A fact for cache keys: changes when the lock does. */
	readonly key: string;
};

export function readLock(path = ANDROID_LIBRARIES_LOCK): ReadonlyArray<LockedArtifact> {
	const lock = JSON.parse(readFileSync(path, 'utf8')) as {
		version: string;
		artifacts: LockedArtifact[];
	};
	if (lock.version !== LOCK_VERSION)
		throw new Error(`${path} is ${lock.version}; this harness reads ${LOCK_VERSION}`);
	return lock.artifacts;
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function download(artifact: LockedArtifact): Promise<string> {
	const extension = artifact.url.endsWith('.aar') ? 'aar' : 'jar';
	const file = join(cacheRoot(), 'maven', `${artifact.sha256}.${extension}`);
	if (existsSync(file) && sha256(readFileSync(file)) === artifact.sha256) return file;
	const response = await fetch(artifact.url);
	if (!response.ok) throw new Error(`GET ${artifact.url}: ${response.status}`);
	const bytes = new Uint8Array(await response.arrayBuffer());
	const digest = sha256(bytes);
	if (digest !== artifact.sha256)
		throw new Error(
			`${artifact.coordinate} from ${artifact.url} is sha256 ${digest}, not the lock's ${artifact.sha256}`,
		);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(`${file}.part`, bytes);
	renameSync(`${file}.part`, file);
	return file;
}

/** Unpacks an AAR once (classes.jar, libs/*.jar, res/) and compiles its resources with aapt2. */
async function unpackAar(tools: AndroidTools, aar: string, artifact: LockedArtifact) {
	const root = join(
		cacheRoot(),
		'android-libraries',
		`${artifact.sha256}-${sha256(Buffer.from(tools.buildTools)).slice(0, 8)}-${SHELL_CACHE_FORMAT}`.replace(
			'/',
			'-',
		),
	);
	const compiled = join(root, 'res.zip');
	await cachedFolder(root, async (scratch) => {
		await exec(
			'unzip',
			['-q', '-o', aar, 'classes.jar', 'libs/*', 'res/*', '-d', join(scratch, 'aar')],
			{
				allowFailure: true,
			},
		).then((r) => {
			// unzip exits 11 when a named pattern (libs/*, res/*) matches nothing.
			if (r.code !== 0 && r.code !== 11)
				throw new Error(`unzip ${aar} exited ${r.code}\n${r.stderr}`);
		});
		if (artifact.resources)
			await exec(join(tools.buildTools, 'aapt2'), [
				'compile',
				'--dir',
				join(scratch, 'aar', 'res'),
				'-o',
				join(scratch, 'res.zip'),
			]);
	});
	return {
		jars: [
			join(root, 'aar', 'classes.jar'),
			...filesUnder(join(root, 'aar', 'libs'), '.jar'),
		].filter((jar) => existsSync(jar)),
		resources: artifact.resources ? compiled : undefined,
	};
}

/** Downloads every locked artifact into the harness cache (checking its sha256) and prepares it for kotlinc, aapt2 and d8. */
export async function androidLibraries(
	tools: AndroidTools,
	lockPath = ANDROID_LIBRARIES_LOCK,
): Promise<AndroidLibraries> {
	const artifacts = readLock(lockPath).filter((artifact) => !artifact.toolchain);
	const files = await Promise.all(artifacts.map(download));
	const jars: string[] = [];
	const resources: string[] = [];
	const rPackages = new Set<string>();
	for (const [at, artifact] of artifacts.entries()) {
		const file = files[at]!;
		if (!artifact.url.endsWith('.aar')) {
			jars.push(file);
			continue;
		}
		const unpacked = await unpackAar(tools, file, artifact);
		jars.push(...unpacked.jars);
		if (unpacked.resources) resources.push(unpacked.resources);
		if (artifact.rClass) rPackages.add(artifact.package!);
	}
	return {
		jars,
		resources,
		rPackages: [...rPackages],
		key: sha256(readFileSync(lockPath)),
	};
}

// `node android-libraries.ts <out dir>`: writes classpath.txt, resources.txt (one path a line) and packages.txt for build-apk.sh.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const out = process.argv[2];
	if (!out) throw new Error('usage: android-libraries.ts <out dir>');
	const libraries = await androidLibraries(await androidTools());
	mkdirSync(out, { recursive: true });
	writeFileSync(join(out, 'classpath.txt'), `${libraries.jars.join('\n')}\n`);
	writeFileSync(join(out, 'resources.txt'), `${libraries.resources.join('\n')}\n`);
	writeFileSync(join(out, 'packages.txt'), `${libraries.rPackages.join(':')}\n`);
}
