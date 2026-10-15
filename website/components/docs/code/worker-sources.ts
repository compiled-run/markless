// The compile worker's source host: package source is bundled as text, read on first use,
// and served to the bundler through its in-memory file system.
import type { SourceHost } from './bundle-host.ts';
import { packageFile } from './package-exports.ts';
import type { CodeFile } from './protocol.ts';
import {
	addSourceFile,
	hasSourceContents,
	readFileSync,
	removeSourceFile,
	takeSourceMisses,
} from './source-fs.ts';
import { isRuntimeSpecifier, sourcePackageManifests, sourcePackages } from './source-packages.ts';

const GLOB_ROOT = '../../../../packages/';
const PACKAGES = '/packages/';
const texts = import.meta.glob(
	[
		'../../../../packages/headless/components/src/**/*.{ts,tsrx}',
		'../../../../packages/headless/icons/src/*.ts',
		'!**/*.{browser,sr,nvda,voiceover,test}.ts',
		'!**/*-transcript.ts',
		'!**/scenarios/**',
		'!**/vite.ts',
	],
	{ query: '?raw', import: 'default' },
) as Record<string, () => Promise<string>>;

const loaders = new Map<string, () => Promise<string>>();
for (const [key, load] of Object.entries(texts)) {
	const path = `${PACKAGES}${key.slice(GLOB_ROOT.length)}`;
	loaders.set(path, load);
	addSourceFile(path);
}
for (const [path, code] of Object.entries(sourcePackageManifests(PACKAGES)))
	addSourceFile(path, code);

const packages = sourcePackages(PACKAGES);
const placed = new Map<string, string[]>();

async function read(path: string): Promise<string | undefined> {
	if (hasSourceContents(path)) return readFileSync(path);
	const load = loaders.get(path);
	if (!load) return undefined;
	const code = await load();
	addSourceFile(path, code);
	return code;
}

/** Every package source file the worker can load, by its path in the in-memory file system. */
export function sourceFiles(): string[] {
	return [...loaders.keys()];
}

/** The source host for one block: its files live in their own folder, the package source is shared. */
export function workerSourceHost(block: string): SourceHost {
	const codeDir = `/code/${encodeURIComponent(block)}/`;
	return {
		codeDir,
		root: '/',
		isRuntime: isRuntimeSpecifier,
		packageFile: (specifier) => packageFile(packages, specifier),
		placeBlock(files: readonly CodeFile[]) {
			for (const path of placed.get(block) ?? []) removeSourceFile(path);
			const paths = files.map((file) => `${codeDir}${file.name}`);
			placed.set(block, paths);
			files.forEach((file, index) => addSourceFile(paths[index]!, file.code));
		},
		read,
		async takeMisses() {
			const misses = takeSourceMisses();
			await Promise.all(misses.map(read));
			return misses;
		},
	};
}
