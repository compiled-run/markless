// Publish-shape guard for the npm release set. Asserts that every release
// package carries publishConfig fields that pnpm rewrites at publish time
// (dist-targeting exports, files, bin) and — when `vp pack` output exists —
// that every published exports target exists on disk and the core root entry
// stays node-free after packing.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import rootConfig from '../../vite.config.ts';
import { releasePackages } from './release-packages.mjs';

const repoRoot = resolve(import.meta.dirname, '../..');

// Derived, never restated. This file used to carry an eight-name literal — the
// third copy of the release set — and a copy like it is exactly how
// `verify-publish-ready.mjs --all` silently stopped covering
// @markless/analyzer and @markless/typescript-plugin.
const releasePackageEntries = releasePackages();
const releasePackagesByName = new Map(releasePackageEntries.map((entry) => [entry.name, entry]));

type ExportTarget = string | { readonly [condition: string]: ExportTarget | undefined };

type PackageManifest = {
	readonly name?: string;
	readonly version?: string;
	readonly private?: boolean;
	readonly license?: string;
	readonly files?: readonly string[];
	readonly types?: string;
	readonly exports?: Record<string, ExportTarget>;
	readonly bin?: Record<string, string>;
	readonly scripts?: Record<string, string>;
	readonly dependencies?: Record<string, string>;
	readonly repository?: { readonly url?: string; readonly directory?: string };
	readonly publishConfig?: {
		readonly access?: string;
		readonly provenance?: boolean;
		readonly marklessShipsSource?: boolean;
		readonly types?: string;
		readonly exports?: Record<string, ExportTarget>;
		readonly bin?: Record<string, string>;
	};
};

function readManifest(packageName: string): PackageManifest {
	const entry =
		releasePackagesByName.get(packageName) ??
		releasePackagesByName.get(`@markless/${packageName}`);
	if (entry === undefined) throw new Error(`release package ${packageName} not found`);
	return JSON.parse(readFileSync(entry.manifestPath, 'utf8')) as PackageManifest;
}

/**
 * Every string leaf under an exports target, whatever conditions wrap it.
 * Reading only `types`/`default` skipped `require` entries, so a CommonJS
 * export could point at a file no build produced and still pass. Mirrors
 * `verify-publish-ready.mjs`.
 */
function targetPaths(target: ExportTarget): string[] {
	if (typeof target === 'string') {
		return [target];
	}
	return Object.values(target)
		.filter((value): value is ExportTarget => value !== undefined)
		.flatMap(targetPaths);
}

/**
 * A TypeScript declaration file. `.d.cts` is the correct extension for the
 * declarations of a CommonJS entry inside a `"type": "module"` package
 * (@markless/typescript-plugin ships CJS because tsserver `require`s plugins);
 * naming it `.d.ts` there would declare it ESM-flavoured and misresolve.
 */
function isDeclarationTarget(path: string): boolean {
	return /\.d\.(?:c|m)?ts$/.test(path);
}

/**
 * Expands a published exports target against the matching source glob so
 * `./dist/fns/*.js` is checked once per real `./src/fns/*.ts` module.
 */
function expandPublishedTargets(
	packageDir: string,
	packageName: string,
	subpath: string,
	sourceTarget: ExportTarget,
	publishedTarget: ExportTarget,
): string[] {
	const published = targetPaths(publishedTarget);
	if (!subpath.includes('*')) {
		return published;
	}
	const sourcePattern = targetPaths(sourceTarget)[0];
	if (sourcePattern === undefined || !sourcePattern.includes('*')) {
		throw new Error(`${packageName}: glob subpath ${subpath} has no source glob to expand`);
	}
	const [sourceDirPart] = sourcePattern.split('*');
	const sourceDir = resolve(packageDir, sourceDirPart ?? '');
	const stems = readdirSync(sourceDir)
		.filter((file) => file.endsWith('.ts'))
		.map((file) => file.slice(0, -'.ts'.length));
	return stems.flatMap((stem) => published.map((path) => path.replaceAll('*', stem)));
}

function staticImportSpecifiers(code: string): string[] {
	const specifiers: string[] = [];
	const importPattern = /(?:from\s*|^import\s*|\bimport\()\s*['"]([^'"]+)['"]/gm;
	for (const match of code.matchAll(importPattern)) {
		const specifier = match[1];
		if (specifier !== undefined) {
			specifiers.push(specifier);
		}
	}
	return specifiers;
}

describe('publish manifest shape', () => {
	// every release package must share the core package's version; the number
	// itself is owned by the release process, not this test
	const releaseVersion = readManifest('core').version;
	test('release version is a concrete semver', () => {
		expect(releaseVersion).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
	});
	for (const entry of releasePackageEntries) {
		const packageName = entry.name;
		test(`${packageName} carries publishable fields`, () => {
			const manifest = readManifest(packageName);
			expect(manifest.private, `${packageName} must not be private`).toBeUndefined();
			expect(manifest.version, `${packageName} version`).toBe(releaseVersion);
			expect(manifest.license, `${packageName} license`).toBe('MIT');
			expect(manifest.publishConfig?.access, `${packageName} access`).toBe('public');
			expect(manifest.publishConfig?.provenance, `${packageName} provenance`).toBe(true);
			expect(manifest.repository?.url, `${packageName} repository.url`).toBeTypeOf('string');
			expect(manifest.repository?.directory, `${packageName} repository.directory`).toBe(
				entry.directory,
			);
			if (
				manifest.types !== undefined &&
				manifest.publishConfig?.marklessShipsSource !== true
			) {
				expect(manifest.publishConfig?.types, `${packageName} published types`).toMatch(
					/^\.\/dist\//,
				);
			}
			if (manifest.publishConfig?.marklessShipsSource === true) {
				expect(
					manifest.files,
					`${packageName} ships src (source-shipped package)`,
				).toContain('src');
			} else {
				expect(manifest.files, `${packageName} files field`).toContain('dist');
				expect(
					manifest.files,
					`${packageName} must not ship TypeScript source`,
				).not.toContain('src');
			}
			expect(
				manifest.scripts?.prepublishOnly,
				`${packageName} prepublishOnly guard`,
			).toContain('verify-publish-ready.mjs');
		});

		test(`${packageName} publishConfig.exports mirrors its complete dev exports surface`, () => {
			const manifest = readManifest(packageName);
			const devExports = manifest.exports ?? {};
			const publishedExports = manifest.publishConfig?.exports;
			expect(publishedExports, `${packageName} publishConfig.exports`).toBeDefined();
			expect(Object.keys(publishedExports ?? {}).sort()).toEqual(
				Object.keys(devExports).sort(),
			);
			for (const [subpath, target] of Object.entries(publishedExports ?? {})) {
				const paths = targetPaths(target);
				const distBacked = paths.some((path) => path.startsWith('./dist/'));
				if (manifest.publishConfig?.marklessShipsSource === true && !distBacked) {
					expect(paths, `${packageName} ${subpath} source targets`).toEqual(
						targetPaths(devExports[subpath] ?? {}),
					);
				} else {
					for (const path of paths) {
						expect(
							path.startsWith('./dist/'),
							`${packageName} ${subpath} -> ${path} must target ./dist`,
						).toBe(true);
					}
					expect(
						paths.some(isDeclarationTarget),
						`${packageName} ${subpath} needs a types target`,
					).toBe(true);
				}
			}
		});

		test(`${packageName} workspace dependencies stay on the workspace protocol`, () => {
			const manifest = readManifest(packageName);
			for (const [dependency, range] of Object.entries(manifest.dependencies ?? {})) {
				if (dependency.startsWith('@markless/')) {
					expect(
						range.startsWith('workspace:'),
						`${packageName} -> ${dependency} must be workspace: so pnpm rewrites it`,
					).toBe(true);
				}
			}
		});
	}

	// The router vite plugin serves these files as APP-CONTEXT virtual entries:
	// the consumer app's vite compiles them so import.meta.glob('/pages/**')
	// resolves against the app root. They must ship as source .ts inside the
	// tarball, and every import they carry must survive leaving the monorepo
	// (package specifiers that resolve through publishConfig.exports — never
	// ../.. paths into unshipped src/). The full proof is the router-app
	// tarball-consumer build in the release runbook; this is the cheap static
	// form that runs on every test pass.
	describe('router vite-plugin app-context entries survive publishing', () => {
		const routerDir = resolve(repoRoot, 'packages', 'router');
		const entriesDir = resolve(routerDir, 'src/vite/entries');
		const pluginSource = readFileSync(resolve(routerDir, 'src/vite/index.ts'), 'utf8');
		const requestedEntryFiles = [
			...new Set(
				[
					...(pluginSource.match(/virtualEntryFiles = \{[^}]*\}/)?.[0] ?? '').matchAll(
						/'([\w-]+\.ts)'/g,
					),
				].map((match) => match[1]),
			),
		];

		test('the entries directory ships in the tarball and holds every requested entry', () => {
			expect(readManifest('router').files).toContain('src/vite/entries');
			// Sanity floor: the extraction regex must keep finding the plugin's map.
			expect(requestedEntryFiles.length).toBeGreaterThanOrEqual(5);
			for (const fileName of requestedEntryFiles) {
				expect(
					existsSync(resolve(entriesDir, fileName ?? '')),
					`router entry ${fileName} missing from src/vite/entries`,
				).toBe(true);
			}
		});

		test('entry imports are package or virtual specifiers that resolve when published', () => {
			for (const fileName of readdirSync(entriesDir)) {
				if (!fileName.endsWith('.ts')) continue;
				const code = readFileSync(resolve(entriesDir, fileName), 'utf8');
				for (const specifier of staticImportSpecifiers(code)) {
					expect(
						specifier.startsWith('.'),
						`entries/${fileName} imports '${specifier}' relatively — unresolvable outside the monorepo`,
					).toBe(false);
					if (!specifier.startsWith('@markless/')) continue;
					const [, packageName, ...rest] = specifier.split('/');
					const subpath = rest.length === 0 ? '.' : `./${rest.join('/')}`;
					expect(
						readManifest(`@markless/${packageName ?? ''}`).publishConfig?.exports?.[
							subpath
						],
						`entries/${fileName} imports '${specifier}' but @markless/${packageName} publishes no ${subpath} export`,
					).toBeDefined();
				}
			}
		});
	});

	test('create-markless bin is rewritten to a dist file and ships templates', () => {
		const manifest = readManifest('create-markless');
		const publishedBin = manifest.publishConfig?.bin?.['create-markless'];
		expect(publishedBin, 'cli publishConfig.bin').toBeDefined();
		expect(publishedBin?.startsWith('./dist/')).toBe(true);
		expect(manifest.files).toContain('templates');
	});
});

// Requires `vp pack` output. Skipped when dist is absent (CI runs `vp test`
// without packing); the prepublishOnly guard re-enforces this fail-closed at
// publish time, so a publish can never skip these checks.
const packedDistExists = releasePackageEntries.every((entry) =>
	existsSync(resolve(entry.packageDir, 'dist')),
);

describe.skipIf(!packedDistExists)('packed dist output (run `vp pack` first)', () => {
	for (const entry of releasePackageEntries) {
		const packageName = entry.name;
		test(`${packageName} publishConfig.exports targets exist after vp pack`, () => {
			const manifest = readManifest(packageName);
			const devExports = manifest.exports ?? {};
			for (const [subpath, target] of Object.entries(manifest.publishConfig?.exports ?? {})) {
				const sourceTarget = devExports[subpath];
				expect(sourceTarget, `${packageName} ${subpath} has a dev export`).toBeDefined();
				for (const path of expandPublishedTargets(
					entry.packageDir,
					packageName,
					subpath,
					sourceTarget as ExportTarget,
					target,
				)) {
					expect(
						existsSync(resolve(entry.packageDir, path)),
						`${packageName} ${subpath} -> ${path} missing from dist`,
					).toBe(true);
				}
			}
		});
	}

	test('create-markless packed bin exists and keeps its shebang', () => {
		const manifest = readManifest('create-markless');
		const binPath = manifest.publishConfig?.bin?.['create-markless'];
		expect(binPath).toBeDefined();
		const absolute = resolve(repoRoot, 'packages', 'cli', binPath ?? '');
		expect(existsSync(absolute), `cli bin ${binPath} missing from dist`).toBe(true);
		expect(readFileSync(absolute, 'utf8').startsWith('#!')).toBe(true);
	});

	test('@markless/router packed vite plugin resolves entries where the tarball ships them', () => {
		// dist/vite.js resolves the app-context entries relative to the package
		// root; the literal must point at the shipped src/vite/entries directory.
		const code = readFileSync(resolve(repoRoot, 'packages', 'router', 'dist/vite.js'), 'utf8');
		expect(
			code.includes('src/vite/entries'),
			'dist/vite.js must resolve published entries under src/vite/entries',
		).toBe(true);
	});

	test('@markless/core packed root entry stays node-free and bundler-free', () => {
		const manifest = readManifest('core');
		const rootTarget = manifest.publishConfig?.exports?.['.'];
		const rootJs = targetPaths(rootTarget ?? {}).find((path) => path.endsWith('.js'));
		expect(rootJs, 'core root js target').toBeDefined();
		const code = readFileSync(resolve(repoRoot, 'packages', 'core', rootJs ?? ''), 'utf8');
		for (const specifier of staticImportSpecifiers(code)) {
			expect(specifier.startsWith('node:'), `core root entry imports ${specifier}`).toBe(
				false,
			);
			for (const forbidden of ['rolldown', 'vite', '@markless/bundler']) {
				expect(
					specifier === forbidden || specifier.startsWith(`${forbidden}/`),
					`core root entry imports ${specifier}`,
				).toBe(false);
			}
		}
	});
});

// A published target no build step writes is only caught at publish time, after
// `vp pack` has already cleaned dist. Read the pack config instead: every dist
// target must come from an entry or a copied file.
describe('the pack config produces every published dist target', () => {
	const packConfigs = [rootConfig.pack ?? []].flat();
	for (const entry of releasePackageEntries) {
		const pack = packConfigs.find(
			(candidate) => resolve(candidate.cwd ?? '.') === entry.packageDir,
		);
		// A package built by its own script (@markless/typescript-plugin ships CJS) has no pack entry.
		if (pack === undefined) continue;
		test(`${entry.name} builds or copies every published dist target`, () => {
			const produced = new Set<string>();
			for (const stem of Object.keys(pack.entry ?? {})) {
				produced.add(`./dist/${stem}.js`);
				produced.add(`./dist/${stem}.d.ts`);
			}
			for (const copied of [pack.copy ?? []].flat()) {
				const from = typeof copied === 'string' ? copied : copied.from;
				for (const path of [from].flat()) produced.add(`./dist/${basename(path)}`);
			}
			const manifest = readManifest(entry.name);
			const published = [
				...Object.values(manifest.publishConfig?.exports ?? {}).flatMap(targetPaths),
				...Object.values(manifest.publishConfig?.bin ?? {}),
				manifest.publishConfig?.types ?? '',
			];
			for (const path of published) {
				// CJS targets come from a package's own build:cjs script, not from `vp pack`.
				const packBuilt = /\.js$|\.d\.ts$/.test(path);
				if (!path.startsWith('./dist/') || path.includes('*') || !packBuilt) continue;
				expect(
					produced,
					`${entry.name} publishes ${path}, which no pack step writes`,
				).toContain(path);
			}
		});
	}
});
