// The id every compiled artifact spells a module by: root-relative posix, so a
// build carries no machine path. A dependency file reachable through a link in
// `root/node_modules` (pnpm's store layout, a workspace package) is spelled
// through that link, so the store spelling does not leak either.
import { readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, join, normalize, relative, resolve } from 'pathe';

type LinkedPackage = { readonly id: string; readonly real: string };

const linkedPackagesByRoot = new Map<string, ReadonlyArray<LinkedPackage>>();

export function moduleIdFor(filename: string, root: string | undefined): string {
	if (!root || !isAbsolute(filename)) return filename;
	const id = relative(root, filename);
	if (!id.startsWith('..') && !id.includes('node_modules/')) return id;
	return packageRootedModuleId(filename, root) ?? id;
}

/** The file a module id names, spelled the way the bundler resolved it. */
export function sourceForModuleId(moduleId: string, root: string | undefined): string {
	if (!root || isAbsolute(moduleId)) return moduleId;
	return realpathOf(resolve(root, moduleId));
}

function packageRootedModuleId(filename: string, root: string): string | null {
	const real = realpathOf(filename);
	for (const linked of linkedPackages(root)) {
		if (real === linked.real) return linked.id;
		if (real.startsWith(`${linked.real}/`)) return `${linked.id}${real.slice(linked.real.length)}`;
	}
	return null;
}

function linkedPackages(root: string): ReadonlyArray<LinkedPackage> {
	const cached = linkedPackagesByRoot.get(root);
	if (cached) return cached;
	const directory = join(root, 'node_modules');
	const packages: LinkedPackage[] = [];
	for (const name of packageNames(directory)) {
		try {
			packages.push({ id: `node_modules/${name}`, real: realpathOf(join(directory, name)) });
		} catch {
			// A dangling link names nothing.
		}
	}
	// Longest real path first, so a package nested inside another wins for its own files.
	packages.sort((a, b) => b.real.length - a.real.length);
	linkedPackagesByRoot.set(root, packages);
	return packages;
}

function packageNames(directory: string): string[] {
	let entries: string[];
	try {
		entries = readdirSync(directory);
	} catch {
		return [];
	}
	return entries.flatMap((entry) => {
		if (entry.startsWith('.')) return [];
		if (!entry.startsWith('@')) return [entry];
		try {
			return readdirSync(join(directory, entry)).map((scoped) => `${entry}/${scoped}`);
		} catch {
			return [];
		}
	});
}

function realpathOf(path: string): string {
	try {
		return normalize(realpathSync(path));
	} catch {
		return normalize(path);
	}
}
