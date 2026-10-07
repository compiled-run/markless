import { existsSync, readFileSync, realpathSync } from 'node:fs';
import type { AliasOptions, UserConfig } from 'vite';
import { dirname, isAbsolute, join, normalize, resolve } from 'pathe';

export type DepResolution = Pick<UserConfig, 'root'> & {
	readonly resolve?: Pick<NonNullable<UserConfig['resolve']>, 'alias' | 'preserveSymlinks'>;
};

// Vite pre-bundles what resolves inside node_modules and serves a linked package
// from source; forcing a linked runtime entry through the optimizer ships the
// browser a second copy of the runtime, split from every other source import.
export function optimizedDepsToInclude(
	specifiers: ReadonlyArray<string>,
	resolution: DepResolution,
): string[] {
	const root = resolve(resolution.root ?? '');
	const preserveSymlinks = resolution.resolve?.preserveSymlinks === true;
	const alias = resolution.resolve?.alias;
	return specifiers.filter(
		(specifier) => !servedFromSource(applyAlias(specifier, alias), root, preserveSymlinks),
	);
}

// Emitted code reaches these entries only from a browser interaction, so dev has
// to pre-bundle them up front or the first click triggers a re-optimize that
// invalidates the hashed chunk URLs pages are already holding.
export function includeOptimizedDeps(config: UserConfig, specifiers: ReadonlyArray<string>): void {
	const bundled = optimizedDepsToInclude(specifiers, config);
	if (bundled.length === 0) return;
	const optimizeDeps = (config.optimizeDeps ??= {});
	const include = optimizeDeps.include ?? [];
	optimizeDeps.include = [
		...include,
		...bundled.filter((specifier) => !include.includes(specifier)),
	];
}

// A package that ships Markless source (`publishConfig.marklessShipsSource`) is compiled by the
// app's own pipeline; the optimizer would parse its `.tsrx` as JavaScript.
export function excludeSourceShippedDeps(config: UserConfig): void {
	const root = resolve(config.root ?? '');
	const appManifest = nearestManifest(root);
	if (!appManifest) return;
	const shipsSource: string[] = [];
	const seen = new Set<string>();
	const visit = (names: Iterable<string>, from: string) => {
		for (const name of names) {
			const directory = installedPackage(name, from);
			if (directory === undefined || seen.has(directory)) continue;
			seen.add(directory);
			const manifest = readManifest(join(directory, 'package.json'));
			if (manifest?.publishConfig?.marklessShipsSource !== true) continue;
			if (!shipsSource.includes(name)) shipsSource.push(name);
			visit(Object.keys(manifest.dependencies ?? {}), realpathOf(directory));
		}
	};
	visit(
		[
			...Object.keys(appManifest.manifest.dependencies ?? {}),
			...Object.keys(appManifest.manifest.devDependencies ?? {}),
		],
		appManifest.directory,
	);
	if (shipsSource.length === 0) return;
	const optimizeDeps = (config.optimizeDeps ??= {});
	const exclude = optimizeDeps.exclude ?? [];
	optimizeDeps.exclude = [...exclude, ...shipsSource.filter((name) => !exclude.includes(name))];
}

type PackageManifest = {
	readonly dependencies?: Record<string, string>;
	readonly devDependencies?: Record<string, string>;
	readonly publishConfig?: { readonly marklessShipsSource?: unknown };
};

function readManifest(path: string): PackageManifest | undefined {
	try {
		return JSON.parse(readFileSync(path, 'utf8')) as PackageManifest;
	} catch {
		return undefined;
	}
}

function nearestManifest(
	root: string,
): { readonly directory: string; readonly manifest: PackageManifest } | undefined {
	for (let directory = root; ; directory = dirname(directory)) {
		const manifest = existsSync(join(directory, 'package.json'))
			? readManifest(join(directory, 'package.json'))
			: undefined;
		if (manifest) return { directory, manifest };
		if (dirname(directory) === directory) return undefined;
	}
}

// Vite's alias matching: a string find is the id or a `find/` prefix of it.
function applyAlias(specifier: string, alias: AliasOptions | undefined): string {
	if (!alias) return specifier;
	const entries = Array.isArray(alias)
		? alias
		: Object.entries(alias as Record<string, string>).map(([find, replacement]) => ({
				find,
				replacement,
			}));
	for (const { find, replacement } of entries) {
		if (typeof find === 'string') {
			if (specifier === find || specifier.startsWith(`${find}/`))
				return replacement + specifier.slice(find.length);
		} else if (find.test(specifier)) return specifier.replace(find, replacement);
	}
	return specifier;
}

function servedFromSource(id: string, root: string, preserveSymlinks: boolean): boolean {
	const path =
		isAbsolute(id) || id.startsWith('.') ? resolve(root, id) : installedPackage(id, root);
	if (path === undefined) return false;
	return !`${preserveSymlinks ? normalize(path) : realpathOf(path)}/`.includes('/node_modules/');
}

// The nearest node_modules entry above the root, the way resolution finds it;
// an uninstalled package is left for Vite to report.
function installedPackage(specifier: string, root: string): string | undefined {
	const segments = specifier.split('/');
	const name = specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0]!;
	for (let directory = root; ; directory = dirname(directory)) {
		const entry = join(directory, 'node_modules', name);
		if (existsSync(entry)) return entry;
		if (dirname(directory) === directory) return undefined;
	}
}

function realpathOf(path: string): string {
	try {
		return normalize(realpathSync(path));
	} catch {
		return normalize(path);
	}
}
