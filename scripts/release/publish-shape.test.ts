// Publish-shape guard for the npm release set. Asserts that every release
// package carries publishConfig fields that pnpm rewrites at publish time
// (dist-targeting exports, files, bin) and — when `vp pack` output exists —
// that every published exports target exists on disk and the core root entry
// stays node-free after packing.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../..');

const releasePackages = [
	'core',
	'web',
	'router',
	'bundler',
	'runtime',
	'serializer',
	'compiler',
	'cli',
] as const;

type ExportTarget = string | { readonly types?: string; readonly default?: string };

type PackageManifest = {
	readonly name?: string;
	readonly version?: string;
	readonly private?: boolean;
	readonly license?: string;
	readonly files?: readonly string[];
	readonly exports?: Record<string, ExportTarget>;
	readonly bin?: Record<string, string>;
	readonly scripts?: Record<string, string>;
	readonly dependencies?: Record<string, string>;
	readonly publishConfig?: {
		readonly access?: string;
		readonly exports?: Record<string, ExportTarget>;
		readonly bin?: Record<string, string>;
	};
};

function readManifest(packageName: string): PackageManifest {
	return JSON.parse(
		readFileSync(resolve(repoRoot, 'packages', packageName, 'package.json'), 'utf8'),
	) as PackageManifest;
}

function targetPaths(target: ExportTarget): string[] {
	if (typeof target === 'string') {
		return [target];
	}
	return [target.types, target.default].filter((path): path is string => path !== undefined);
}

/**
 * Expands a published exports target against the matching source glob so
 * `./dist/fns/*.js` is checked once per real `./src/fns/*.ts` module.
 */
function expandPublishedTargets(
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
	const sourceDir = resolve(repoRoot, 'packages', packageName, sourceDirPart ?? '');
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
	for (const packageName of releasePackages) {
		test(`@markless/${packageName} carries publishable fields`, () => {
			const manifest = readManifest(packageName);
			expect(manifest.private, `${packageName} must not be private`).toBeUndefined();
			expect(manifest.version, `${packageName} version`).toBe('0.1.0');
			expect(manifest.license, `${packageName} license`).toBe('MIT');
			expect(manifest.publishConfig?.access, `${packageName} access`).toBe('public');
			expect(manifest.files, `${packageName} files field`).toContain('dist');
			expect(
				manifest.files,
				`${packageName} must not ship TypeScript source`,
			).not.toContain('src');
			expect(
				manifest.scripts?.prepublishOnly,
				`${packageName} prepublishOnly guard`,
			).toContain('verify-publish-ready.mjs');
		});

		test(`@markless/${packageName} publishConfig.exports mirrors the dev exports surface into dist`, () => {
			const manifest = readManifest(packageName);
			const devExports = manifest.exports ?? {};
			const publishedExports = manifest.publishConfig?.exports;
			expect(publishedExports, `${packageName} publishConfig.exports`).toBeDefined();
			expect(Object.keys(publishedExports ?? {}).sort()).toEqual(
				Object.keys(devExports).sort(),
			);
			for (const [subpath, target] of Object.entries(publishedExports ?? {})) {
				for (const path of targetPaths(target)) {
					expect(
						path.startsWith('./dist/'),
						`${packageName} ${subpath} -> ${path} must target ./dist`,
					).toBe(true);
				}
				expect(
					targetPaths(target).some((path) => path.endsWith('.d.ts')),
					`${packageName} ${subpath} needs a types target`,
				).toBe(true);
			}
		});

		test(`@markless/${packageName} workspace dependencies stay on the workspace protocol`, () => {
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

	test('create-markless bin is rewritten to a dist file and ships templates', () => {
		const manifest = readManifest('cli');
		const publishedBin = manifest.publishConfig?.bin?.['create-markless'];
		expect(publishedBin, 'cli publishConfig.bin').toBeDefined();
		expect(publishedBin?.startsWith('./dist/')).toBe(true);
		expect(manifest.files).toContain('templates');
	});
});

// Requires `vp pack` output. Skipped when dist is absent (CI runs `vp test`
// without packing); the prepublishOnly guard re-enforces this fail-closed at
// publish time, so a publish can never skip these checks.
const packedDistExists = releasePackages.every((packageName) =>
	existsSync(resolve(repoRoot, 'packages', packageName, 'dist')),
);

describe.skipIf(!packedDistExists)('packed dist output (run `vp pack` first)', () => {
	for (const packageName of releasePackages) {
		test(`@markless/${packageName} publishConfig.exports targets all exist after vp pack`, () => {
			const manifest = readManifest(packageName);
			const devExports = manifest.exports ?? {};
			for (const [subpath, target] of Object.entries(manifest.publishConfig?.exports ?? {})) {
				const sourceTarget = devExports[subpath];
				expect(sourceTarget, `${packageName} ${subpath} has a dev export`).toBeDefined();
				for (const path of expandPublishedTargets(
					packageName,
					subpath,
					sourceTarget as ExportTarget,
					target,
				)) {
					expect(
						existsSync(resolve(repoRoot, 'packages', packageName, path)),
						`${packageName} ${subpath} -> ${path} missing from dist`,
					).toBe(true);
				}
			}
		});
	}

	test('create-markless packed bin exists and keeps its shebang', () => {
		const manifest = readManifest('cli');
		const binPath = manifest.publishConfig?.bin?.['create-markless'];
		expect(binPath).toBeDefined();
		const absolute = resolve(repoRoot, 'packages', 'cli', binPath ?? '');
		expect(existsSync(absolute), `cli bin ${binPath} missing from dist`).toBe(true);
		expect(readFileSync(absolute, 'utf8').startsWith('#!')).toBe(true);
	});

	test('@markless/core packed root entry stays node-free and bundler-free', () => {
		const manifest = readManifest('core');
		const rootTarget = manifest.publishConfig?.exports?.['.'];
		const rootJs = targetPaths(rootTarget ?? {}).find((path) => path.endsWith('.js'));
		expect(rootJs, 'core root js target').toBeDefined();
		const code = readFileSync(resolve(repoRoot, 'packages', 'core', rootJs ?? ''), 'utf8');
		for (const specifier of staticImportSpecifiers(code)) {
			expect(
				specifier.startsWith('node:'),
				`core root entry imports ${specifier}`,
			).toBe(false);
			for (const forbidden of ['rolldown', 'vite', '@markless/bundler']) {
				expect(
					specifier === forbidden || specifier.startsWith(`${forbidden}/`),
					`core root entry imports ${specifier}`,
				).toBe(false);
			}
		}
	});
});
