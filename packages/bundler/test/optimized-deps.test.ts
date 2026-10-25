import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import type { UserConfig } from 'vite';
import { dirname, join } from 'pathe';
import { afterAll, describe, expect, test } from 'vitest';
import {
	excludeSourceShippedDeps,
	includeOptimizedDeps,
	optimizedDepsToInclude,
	runtimeFunctionSpecifiers,
} from '../src/optimized-deps.ts';
import {
	RESUME_ENTRY_SPECIFIER,
	STORAGE_FREE_RESUME_ENTRY_SPECIFIER,
} from '../src/source-module.ts';

const RESUME_ENTRIES = [RESUME_ENTRY_SPECIFIER, STORAGE_FREE_RESUME_ENTRY_SPECIFIER];
const UNSCOPED = 'destr/lite';

const directory = mkdtempSync(join(tmpdir(), 'markless-optimized-deps-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

function packageDir(path: string) {
	mkdirSync(path, { recursive: true });
	writeFileSync(join(path, 'package.json'), '{}');
	return path;
}

// npm's flat layout: the package copied into node_modules.
function flatInstall(name: string) {
	const root = join(directory, name);
	packageDir(join(root, 'node_modules', '@markless', 'core'));
	packageDir(join(root, 'node_modules', 'destr'));
	return root;
}

// pnpm's layout: the visible entry links into the store under node_modules/.pnpm.
function pnpmInstall(name: string) {
	const root = join(directory, name);
	const store = packageDir(
		join(
			root,
			'node_modules',
			'.pnpm',
			'@markless+core@1.0.0',
			'node_modules',
			'@markless',
			'core',
		),
	);
	mkdirSync(join(root, 'node_modules', '@markless'), { recursive: true });
	symlinkSync(store, join(root, 'node_modules', '@markless', 'core'), 'dir');
	return root;
}

// A workspace member: the visible entry links to a sibling source folder.
function workspaceLink(name: string) {
	const root = join(directory, name, 'website');
	const source = packageDir(join(directory, name, 'packages', 'core'));
	mkdirSync(join(root, 'node_modules', '@markless'), { recursive: true });
	symlinkSync(source, join(root, 'node_modules', '@markless', 'core'), 'dir');
	return { root, source };
}

describe('optimizedDepsToInclude', () => {
	test('keeps a specifier whose package was copied into node_modules', () => {
		const root = flatInstall('flat');
		expect(optimizedDepsToInclude([...RESUME_ENTRIES, UNSCOPED], { root })).toEqual([
			...RESUME_ENTRIES,
			UNSCOPED,
		]);
	});

	test('keeps a specifier whose package links into the pnpm store', () => {
		const root = pnpmInstall('pnpm');
		expect(optimizedDepsToInclude(RESUME_ENTRIES, { root })).toEqual(RESUME_ENTRIES);
	});

	test('drops a specifier whose package links outside node_modules', () => {
		const { root } = workspaceLink('workspace');
		expect(optimizedDepsToInclude(RESUME_ENTRIES, { root })).toEqual([]);
	});

	test('resolves through the nearest node_modules above the root', () => {
		const root = join(workspaceLink('nested').root, 'apps', 'docs');
		mkdirSync(root, { recursive: true });
		expect(optimizedDepsToInclude(RESUME_ENTRIES, { root })).toEqual([]);
	});

	// With preserveSymlinks Vite keeps the node_modules spelling, so the linked
	// entry is a dependency to it and gets pre-bundled either way.
	test('keeps a linked package when resolve.preserveSymlinks is on', () => {
		const { root } = workspaceLink('preserve');
		expect(
			optimizedDepsToInclude(RESUME_ENTRIES, { root, resolve: { preserveSymlinks: true } }),
		).toEqual(RESUME_ENTRIES);
	});

	test('drops a package an alias points at source outside node_modules', () => {
		const root = flatInstall('alias-object');
		const source = packageDir(join(directory, 'alias-object-src', 'core'));
		expect(
			optimizedDepsToInclude([...RESUME_ENTRIES, UNSCOPED], {
				root,
				resolve: { alias: { '@markless/core': source } },
			}),
		).toEqual([UNSCOPED]);
	});

	test('drops a package a regular-expression alias points at source', () => {
		const root = flatInstall('alias-regexp');
		const source = packageDir(join(directory, 'alias-regexp-src', 'core'));
		expect(
			optimizedDepsToInclude(RESUME_ENTRIES, {
				root,
				resolve: {
					alias: [{ find: /^@markless\/core(\/.*)?$/, replacement: `${source}$1` }],
				},
			}),
		).toEqual([]);
	});

	test('follows an alias onto another installed package', () => {
		const root = flatInstall('alias-package');
		expect(
			optimizedDepsToInclude(RESUME_ENTRIES, {
				root,
				resolve: { alias: [{ find: '@markless/core', replacement: 'destr' }] },
			}),
		).toEqual(RESUME_ENTRIES);
	});

	test('keeps a specifier whose package is not installed, for Vite to report', () => {
		const root = packageDir(join(directory, 'bare'));
		expect(optimizedDepsToInclude(RESUME_ENTRIES, { root })).toEqual(RESUME_ENTRIES);
	});

	test('keeps a relative root against the process working directory', () => {
		expect(optimizedDepsToInclude([UNSCOPED], {})).toEqual([UNSCOPED]);
	});
});

describe('includeOptimizedDeps', () => {
	test('appends after a consumer include without duplicating an entry', () => {
		const config: UserConfig = {
			root: flatInstall('flat-consumer'),
			optimizeDeps: { include: ['some-dep', RESUME_ENTRY_SPECIFIER] },
		};
		includeOptimizedDeps(config, RESUME_ENTRIES);
		expect(config.optimizeDeps?.include).toEqual([
			'some-dep',
			RESUME_ENTRY_SPECIFIER,
			STORAGE_FREE_RESUME_ENTRY_SPECIFIER,
		]);
	});

	test('leaves optimizeDeps untouched when every specifier is linked', () => {
		const config: UserConfig = { root: workspaceLink('linked-consumer').root };
		includeOptimizedDeps(config, RESUME_ENTRIES);
		expect(config.optimizeDeps).toBeUndefined();
	});

	test('reads the consumer alias and preserveSymlinks off the same config', () => {
		const config: UserConfig = {
			root: workspaceLink('linked-preserve').root,
			resolve: { preserveSymlinks: true },
		};
		includeOptimizedDeps(config, RESUME_ENTRIES);
		expect(config.optimizeDeps?.include).toEqual(RESUME_ENTRIES);
	});
});

// An app whose package.json names its dependencies, each installed with its own manifest.
function appWith(
	name: string,
	dependencies: Record<string, Record<string, unknown>>,
	options: { readonly layout?: 'flat' | 'pnpm'; readonly dev?: readonly string[] } = {},
) {
	const root = join(directory, name);
	mkdirSync(root, { recursive: true });
	const names = Object.keys(dependencies);
	const dev = new Set(options.dev ?? []);
	writeFileSync(
		join(root, 'package.json'),
		JSON.stringify({
			dependencies: Object.fromEntries(
				names.filter((n) => !dev.has(n)).map((n) => [n, '1.0.0']),
			),
			devDependencies: Object.fromEntries(
				names.filter((n) => dev.has(n)).map((n) => [n, '1.0.0']),
			),
		}),
	);
	for (const [dependency, manifest] of Object.entries(dependencies)) {
		const visible = join(root, 'node_modules', dependency);
		const installed =
			options.layout === 'pnpm'
				? join(
						root,
						'node_modules',
						'.pnpm',
						`${dependency.replace('/', '+')}@1.0.0`,
						'node_modules',
						dependency,
					)
				: visible;
		mkdirSync(installed, { recursive: true });
		writeFileSync(
			join(installed, 'package.json'),
			JSON.stringify({ name: dependency, ...manifest }),
		);
		if (installed !== visible) {
			mkdirSync(dirname(visible), { recursive: true });
			symlinkSync(installed, visible, 'dir');
		}
	}
	return root;
}

const SHIPS_SOURCE = { publishConfig: { marklessShipsSource: true }, exports: './src/index.ts' };

describe('excludeSourceShippedDeps', () => {
	test('excludes a dependency that declares it ships Markless source', () => {
		const config: UserConfig = {
			root: appWith('ships-flat', { '@acme/kit': SHIPS_SOURCE, destr: {} }),
		};
		excludeSourceShippedDeps(config);
		expect(config.optimizeDeps?.exclude).toEqual(['@acme/kit']);
	});

	test('reads the declaration through a pnpm store link and from devDependencies', () => {
		const config: UserConfig = {
			root: appWith(
				'ships-pnpm',
				{ 'widgets-src': SHIPS_SOURCE, destr: {} },
				{ layout: 'pnpm', dev: ['widgets-src'] },
			),
		};
		excludeSourceShippedDeps(config);
		expect(config.optimizeDeps?.exclude).toEqual(['widgets-src']);
	});

	test('excludes a source-shipping dependency of a source-shipping dependency', () => {
		const root = appWith('ships-nested', {
			'@acme/kit': { ...SHIPS_SOURCE, dependencies: { '@acme/parts': '1.0.0' } },
		});
		const nested = join(root, 'node_modules', '@acme', 'kit', 'node_modules', '@acme', 'parts');
		mkdirSync(nested, { recursive: true });
		writeFileSync(
			join(nested, 'package.json'),
			JSON.stringify({ name: '@acme/parts', ...SHIPS_SOURCE }),
		);
		const config: UserConfig = { root };
		excludeSourceShippedDeps(config);
		expect(config.optimizeDeps?.exclude).toEqual(['@acme/kit', '@acme/parts']);
	});

	test('keeps a consumer exclude and does not duplicate an entry', () => {
		const config: UserConfig = {
			root: appWith('ships-consumer', { '@acme/kit': SHIPS_SOURCE }),
			optimizeDeps: { exclude: ['other', '@acme/kit'] },
		};
		excludeSourceShippedDeps(config);
		expect(config.optimizeDeps?.exclude).toEqual(['other', '@acme/kit']);
	});

	test('leaves optimizeDeps untouched when no dependency ships source', () => {
		const config: UserConfig = { root: appWith('ships-none', { destr: {} }) };
		excludeSourceShippedDeps(config);
		expect(config.optimizeDeps).toBeUndefined();
	});

	test('skips a dependency that is named but not installed', () => {
		const root = appWith('ships-missing', {});
		writeFileSync(
			join(root, 'package.json'),
			JSON.stringify({ dependencies: { ghost: '1.0.0' } }),
		);
		const config: UserConfig = { root };
		excludeSourceShippedDeps(config);
		expect(config.optimizeDeps).toBeUndefined();
	});
});

describe('runtimeFunctionSpecifiers', () => {
	const webPackage = (name: string, files: ReadonlyArray<string>) => {
		const fns = join(directory, name, 'fns');
		mkdirSync(fns, { recursive: true });
		for (const file of files) writeFileSync(join(fns, file), '');
		return pathToFileURL(join(directory, name, 'index.js')).href;
	};

	test('names each built runtime function module through @markless/core', () => {
		const entry = webPackage('web-dist', ['instance-scope.js', 'instance-scope.d.ts', 'row-mint.js']);
		expect(runtimeFunctionSpecifiers(entry).sort()).toEqual([
			'@markless/core > @markless/web/fns/instance-scope',
			'@markless/core > @markless/web/fns/row-mint',
		]);
	});

	test('names nothing for a source checkout, which the dev server serves as it is', () => {
		expect(runtimeFunctionSpecifiers(webPackage('web-src', ['instance-scope.ts']))).toEqual([]);
	});

	test('keeps the nested form only while @markless/core is installed', () => {
		const nested = ['@markless/core > @markless/web/fns/instance-scope'];
		expect(optimizedDepsToInclude(nested, { root: pnpmInstall('nested-pnpm') })).toEqual(nested);
		expect(optimizedDepsToInclude(nested, { root: workspaceLink('nested-link').root })).toEqual([]);
	});
});
