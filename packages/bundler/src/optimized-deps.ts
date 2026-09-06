import { existsSync, realpathSync } from 'node:fs';
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
