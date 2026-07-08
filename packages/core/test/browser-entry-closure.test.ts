import { readFile, readdir } from 'node:fs/promises';
import { expect, test } from 'vitest';

// Permanent guard for the owner doctrine "node-free client graph": the static
// import closure of every browser-reachable package entry must never resolve
// build tooling ('rolldown', '@markless/bundler') or any 'node:*' builtin.
// Build plugins live ONLY on the './vite' / './rolldown' / './preload' style
// subpaths, which are excluded here by design. If this test fails, someone
// reintroduced a build-tooling or Node dependency into a browser entry.

const packagesRoot = new URL('../../', import.meta.url);

// Subpaths that are build-time surfaces on purpose. Everything else exported
// by these packages is treated as browser-reachable and guarded.
const buildOnlySubpaths: Record<string, ReadonlySet<string>> = {
	core: new Set(['./vite', './rolldown', './preload', './router/vite']),
	web: new Set([]),
	runtime: new Set([]),
	serializer: new Set([]),
};

// Router exposes build/tooling surfaces beside the client entry; only the
// root '.' export is a browser entry.
const routerBrowserSubpaths = new Set(['.']);

function forbiddenReason(specifier: string): string | null {
	if (specifier.startsWith('node:')) return 'Node builtin';
	if (specifier === 'rolldown' || specifier.startsWith('rolldown/')) {
		return 'rolldown build tooling';
	}
	if (specifier === '@markless/bundler' || specifier.startsWith('@markless/bundler/')) {
		return '@markless/bundler build module';
	}
	return null;
}

async function packageExportsMap(packageName: string): Promise<Record<string, string>> {
	const raw = await readFile(new URL(`${packageName}/package.json`, packagesRoot), 'utf8');
	const parsed = JSON.parse(raw) as { exports?: Record<string, string> };
	if (!parsed.exports) throw new Error(`packages/${packageName} has no exports map`);
	return parsed.exports;
}

function resolveExportSubpath(
	exportsMap: Record<string, string>,
	subpath: string,
): string | null {
	const exact = exportsMap[subpath];
	if (typeof exact === 'string') return exact;
	for (const [pattern, target] of Object.entries(exportsMap)) {
		const star = pattern.indexOf('*');
		if (star === -1) continue;
		const prefix = pattern.slice(0, star);
		const suffix = pattern.slice(star + 1);
		if (!subpath.startsWith(prefix) || !subpath.endsWith(suffix)) continue;
		const wildcard = subpath.slice(prefix.length, subpath.length - suffix.length);
		return target.replace('*', wildcard);
	}
	return null;
}

// Static `import ... from` / `export ... from` / bare `import '...'` edges plus
// literal dynamic `import('...')` edges. Type-only statements create no
// runtime edge and are skipped.
function importSpecifiers(source: string): string[] {
	const specifiers: string[] = [];
	for (const match of source.matchAll(/^(?:import|export)\b[^;]*?from\s*['"]([^'"]+)['"]/gm)) {
		if (/^(?:import|export)\s+type\b/.test(match[0])) continue;
		specifiers.push(match[1]);
	}
	for (const match of source.matchAll(/^import\s*['"]([^'"]+)['"]/gm)) {
		specifiers.push(match[1]);
	}
	for (const match of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
		specifiers.push(match[1]);
	}
	return specifiers;
}

interface ClosureViolation {
	readonly file: string;
	readonly specifier: string;
	readonly reason: string;
}

async function walkClosure(
	entryUrl: URL,
	exportsByPackage: Map<string, Record<string, string>>,
	visited: Set<string>,
	violations: ClosureViolation[],
): Promise<void> {
	if (visited.has(entryUrl.href)) return;
	visited.add(entryUrl.href);
	const source = await readFile(entryUrl, 'utf8');
	const shortFile = entryUrl.href.slice(packagesRoot.href.length);
	for (const specifier of importSpecifiers(source)) {
		const reason = forbiddenReason(specifier);
		if (reason) violations.push({ file: shortFile, specifier, reason });
		if (specifier.startsWith('./') || specifier.startsWith('../')) {
			await walkClosure(new URL(specifier, entryUrl), exportsByPackage, visited, violations);
			continue;
		}
		if (!specifier.startsWith('@markless/')) continue;
		const [, packageName, ...rest] = specifier.split('/');
		const exportsMap = exportsByPackage.get(packageName);
		if (!exportsMap) continue; // forbidden packages are reported above
		const subpath = rest.length === 0 ? '.' : `./${rest.join('/')}`;
		const target = resolveExportSubpath(exportsMap, subpath);
		if (!target) {
			violations.push({ file: shortFile, specifier, reason: 'unresolvable workspace subpath' });
			continue;
		}
		await walkClosure(
			new URL(target, new URL(`${packageName}/`, packagesRoot)),
			exportsByPackage,
			visited,
			violations,
		);
	}
}

test('browser-entry static import closures never reach rolldown, the bundler, or node builtins', async () => {
	const exportsByPackage = new Map<string, Record<string, string>>();
	for (const packageName of ['core', 'web', 'runtime', 'serializer', 'router']) {
		exportsByPackage.set(packageName, await packageExportsMap(packageName));
	}

	const entries: URL[] = [];
	for (const [packageName, excluded] of Object.entries(buildOnlySubpaths)) {
		const exportsMap = exportsByPackage.get(packageName);
		if (!exportsMap) throw new Error(`missing exports for packages/${packageName}`);
		for (const [subpath, target] of Object.entries(exportsMap)) {
			if (excluded.has(subpath)) continue;
			if (subpath.includes('*')) {
				// Enumerate wildcard entries (e.g. web's ./fns/*) from disk.
				const directory = new URL(target.slice(0, target.indexOf('*')), new URL(`${packageName}/`, packagesRoot));
				for (const fileName of await readdir(directory)) {
					if (fileName.endsWith('.ts')) entries.push(new URL(fileName, directory));
				}
				continue;
			}
			entries.push(new URL(target, new URL(`${packageName}/`, packagesRoot)));
		}
	}
	const routerExports = exportsByPackage.get('router');
	if (!routerExports) throw new Error('missing exports for packages/router');
	for (const subpath of routerBrowserSubpaths) {
		const target = resolveExportSubpath(routerExports, subpath);
		if (!target) throw new Error(`router export ${subpath} missing`);
		entries.push(new URL(target, new URL('router/', packagesRoot)));
	}

	const visited = new Set<string>();
	const violations: ClosureViolation[] = [];
	for (const entry of entries) {
		await walkClosure(entry, exportsByPackage, visited, violations);
	}

	// Sanity floor: the walker must actually traverse the graph. If this drops,
	// the extraction regexes rotted and the guard is no longer guarding.
	expect(entries.length).toBeGreaterThan(20);
	expect(visited.size).toBeGreaterThan(60);

	const report = violations
		.map((violation) => `${violation.file} -> '${violation.specifier}' (${violation.reason})`)
		.join('\n');
	expect(report).toBe('');
});
