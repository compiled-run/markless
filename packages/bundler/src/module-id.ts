// The id every compiled artifact spells a module by: root-relative posix, so a
// build carries no machine path. A dependency file reachable through a link in
// `root/node_modules` (pnpm's store layout, a workspace package) is spelled
// through that link, so the store spelling does not leak either.
import { readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, join, normalize, relative, resolve } from 'pathe';
import { symbolVirtualModuleId, symbolVirtualModuleSourceFile } from './source-module.ts';

type LinkedPackage = { readonly id: string; readonly real: string };

const linkedPackagesByRoot = new Map<string, ReadonlyArray<LinkedPackage>>();
const mintedSources = new Map<string, string>();

export function moduleIdFor(filename: string, root: string | undefined): string {
	if (!root || !isAbsolute(filename)) return filename;
	const relativeId = relative(root, filename);
	const id =
		!relativeId.startsWith('..') && !relativeId.includes('node_modules/')
			? relativeId
			: (packageRootedModuleId(filename, root) ?? relativeId);
	mintedSources.set(`${root}\0${id}`, filename);
	return id;
}

/** The file a module id names, spelled the way the bundler resolved it. */
export function sourceForModuleId(moduleId: string, root: string | undefined): string {
	if (!root || isAbsolute(moduleId)) return moduleId;
	return mintedSources.get(`${root}\0${moduleId}`) ?? realpathOf(resolve(root, moduleId));
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

/** A symbol module's execution-log identity: its virtual id with the source spelled root-relative. */
export function symbolExecutionLogId(virtualModuleId: string, root: string | undefined): string {
	const bare = virtualModuleId.startsWith('\0') ? virtualModuleId.slice(1) : virtualModuleId;
	const source = symbolVirtualModuleSourceFile(bare);
	if (source === null) return bare;
	const encodedSymbolId = bare.slice(bare.lastIndexOf(':') + 1);
	return symbolVirtualModuleId(moduleIdFor(source, root), decodeURIComponent(encodedSymbolId));
}

const EMBEDDED_SOURCE_RE = new RegExp(
	`^(${String.fromCharCode(0)}?(?:virtual:markless:[a-z-]+:|imported:))([^:?]*)(.*)$`,
	's',
);

/**
 * Any id a build writes into output, with the file it names spelled by `moduleIdFor`:
 * a bare path, `virtual:markless:<kind>:<source>...` or `imported:<source>:...`,
 * the source raw or URI-encoded. Other ids pass through unchanged.
 */
export function rootRelativeId(id: string, root: string | undefined): string {
	if (!root) return id;
	if (isAbsolute(id)) {
		const query = id.search(/[?#]/);
		return query < 0
			? moduleIdFor(id, root)
			: `${moduleIdFor(id.slice(0, query), root)}${id.slice(query)}`;
	}
	const match = EMBEDDED_SOURCE_RE.exec(id);
	if (!match) return id;
	const [, prefix, spelled, rest] = match as unknown as [string, string, string, string];
	let source: string;
	try {
		source = decodeURIComponent(spelled);
	} catch {
		return id;
	}
	if (!isAbsolute(source)) return id;
	const moduleId = moduleIdFor(source, root);
	return `${prefix}${spelled === source ? moduleId : encodeURIComponent(moduleId)}${rest}`;
}
