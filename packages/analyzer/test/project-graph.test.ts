import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';
import {
	createProjectGraph,
	DYNAMIC_IMPORT_DECLARATIONS,
	loadProjectGraph,
	SPAWNED_APP_BUILDS,
	type ProjectGraph,
	type DynamicImportDeclaration,
	type SpawnedAppBuild,
	type WorkspacePackage,
} from '../test-support/project-graph.ts';

type Project = {
	files: Record<string, string>;
	assets?: string[];
	packages?: WorkspacePackage[];
	declarations?: DynamicImportDeclaration[];
	spawnedAppBuilds?: SpawnedAppBuild[];
};

const graphOf = async ({
	files,
	assets = [],
	packages = [],
	declarations,
	spawnedAppBuilds,
}: Project) =>
	createProjectGraph({
		files: new Map(Object.entries(files)),
		tracked: new Set([...Object.keys(files), ...assets]),
		packages,
		declarations,
		spawnedAppBuilds,
	});

const testsIn = (files: Record<string, string>) =>
	Object.keys(files).filter((path) => path.endsWith('.test.ts'));

const select = async (project: Project, changed: string[]) =>
	(await graphOf(project)).affectedTests(changed, testsIn(project.files));

describe('module edges', () => {
	test('selects tests that reach a change through a chain of imports, and only those', async () => {
		const files = {
			'pkg/src/leaf.ts': 'export const leaf = 1;',
			'pkg/src/middle.ts': "import { leaf } from './leaf.ts'; export const middle = leaf;",
			'pkg/test/middle.test.ts': "import { middle } from '../src/middle.ts'; middle;",
			'pkg/test/other.test.ts': "import { other } from '../src/other.ts'; other;",
			'pkg/src/other.ts': 'export const other = 2;',
		};
		expect(await select({ files }, ['pkg/src/leaf.ts'])).toEqual({
			tests: ['pkg/test/middle.test.ts'],
			runAll: null,
		});
	});

	test('counts type-only imports as edges', async () => {
		const files = {
			'pkg/src/types.ts': 'export type Shape = { size: number };',
			'pkg/src/use.ts':
				"import type { Shape } from './types.ts'; export const s = (x: Shape) => x;",
			'pkg/test/use.test.ts': "import { s } from '../src/use.ts'; s;",
		};
		expect((await select({ files }, ['pkg/src/types.ts'])).tests).toEqual([
			'pkg/test/use.test.ts',
		]);
	});

	test('follows export * barrels', async () => {
		const files = {
			'pkg/src/impl.ts': 'export const impl = 1;',
			'pkg/src/index.ts': "export * from './impl.ts';",
			'pkg/test/index.test.ts': "import { impl } from '../src/index.ts'; impl;",
		};
		expect((await select({ files }, ['pkg/src/impl.ts'])).tests).toEqual([
			'pkg/test/index.test.ts',
		]);
	});

	test('follows dynamic imports with a static specifier', async () => {
		const files = {
			'pkg/src/lazy.ts': 'export const lazy = 1;',
			'pkg/test/lazy.test.ts': "const { lazy } = await import('../src/lazy.ts'); lazy;",
		};
		expect((await select({ files }, ['pkg/src/lazy.ts'])).tests).toEqual([
			'pkg/test/lazy.test.ts',
		]);
	});

	test('analyzes .tsrx modules in the same graph', async () => {
		const files = {
			'pkg/src/count.ts': 'export const start = 0;',
			'pkg/src/Counter.tsrx':
				"import { start } from './count.ts';\nexport function Counter() @{\n\t<button>{start}</button>\n}\n",
			'pkg/test/counter.test.ts': "import { Counter } from '../src/Counter.tsrx'; Counter;",
		};
		const graph = await graphOf({ files });
		expect(graph.analyzer.module('pkg/src/Counter.tsrx')?.diagnostics).toEqual([]);
		expect(graph.affectedTests(['pkg/src/count.ts'], testsIn(files)).tests).toEqual([
			'pkg/test/counter.test.ts',
		]);
	});

	test('maps workspace specifiers through package.json exports, every condition and wildcard', async () => {
		const files = {
			'packages/web/src/index.ts': 'export const node = 1;',
			'packages/web/src/index.browser.ts': 'export const browser = 1;',
			'packages/web/src/fns/format.ts': 'export const format = 1;',
			'packages/app/test/root.test.ts':
				"import '@markless/web'; import 'vitest'; import '../../web/node_modules/playwright/index.mjs';",
			'packages/app/test/fns.test.ts':
				"import { format } from '@markless/web/fns/format'; format;",
		};
		const packages = [
			{
				dir: 'packages/web',
				name: '@markless/web',
				exports: {
					'.': { browser: './src/index.browser.ts', default: './src/index.ts' },
					'./fns/*': './src/fns/*.ts',
				},
			},
		];
		const graph = await graphOf({ files, packages });
		const tests = testsIn(files);
		expect(graph.affectedTests(['packages/web/src/index.browser.ts'], tests)).toEqual({
			tests: ['packages/app/test/root.test.ts'],
			runAll: null,
		});
		expect(graph.affectedTests(['packages/web/src/index.ts'], tests).tests).toEqual([
			'packages/app/test/root.test.ts',
		]);
		expect(graph.affectedTests(['packages/web/src/fns/format.ts'], tests).tests).toEqual([
			'packages/app/test/fns.test.ts',
		]);
	});

	test('follows non-code imports and files named by new URL(..., import.meta.url)', async () => {
		const files = {
			'pkg/src/worker.ts': 'export {};',
			'pkg/src/spawn.ts':
				"export const url = new URL('./worker.ts', import.meta.url); import data from './data.json'; data;",
			'pkg/test/spawn.test.ts': "import { url } from '../src/spawn.ts'; url;",
		};
		const project = { files, assets: ['pkg/src/data.json'] };
		expect((await select(project, ['pkg/src/worker.ts'])).tests).toEqual([
			'pkg/test/spawn.test.ts',
		]);
		expect((await select(project, ['pkg/src/data.json'])).tests).toEqual([
			'pkg/test/spawn.test.ts',
		]);
	});

	test('a test that runs a script by path from import.meta.dirname is selected when the script or its imports change', async () => {
		const files = {
			'pkg/src/util.ts': 'export const util = 1;',
			'pkg/scripts/build.ts': "import { util } from '../src/util.ts'; util;",
			'pkg/scripts/other.ts': 'export {};',
			'pkg/test/resolve.test.ts':
				"import { resolve } from 'node:path'; spawn(resolve(import.meta.dirname, '../scripts/build.ts'));",
			'pkg/test/join.test.ts':
				"import { join as at } from 'pathe'; spawn(at(import.meta.dirname, '..', `scripts/build.ts`));",
			'pkg/test/local.test.ts':
				"const resolve = (...parts: string[]) => parts.join('/'); resolve(import.meta.dirname, '../scripts/other.ts');",
			'pkg/test/computed.test.ts':
				"import { resolve } from 'node:path'; const name = 'other'; resolve(import.meta.dirname, `../scripts/${name}.ts`);",
		};
		const spawners = ['pkg/test/join.test.ts', 'pkg/test/resolve.test.ts'];
		expect(await select({ files }, ['pkg/scripts/build.ts'])).toEqual({
			tests: spawners,
			runAll: null,
		});
		expect((await select({ files }, ['pkg/src/util.ts'])).tests).toEqual(spawners);
		expect((await select({ files }, ['pkg/scripts/other.ts'])).tests).toEqual([]);
	});
});

describe('computed specifiers with static parts', () => {
	const files = {
		'pkg/src/loader.ts':
			"import { name } from './name.ts'; export const load = () => import(`./plugins/${name}.ts`);",
		'pkg/src/name.ts': "export const name = 'x';",
		'pkg/src/plugins/alpha.ts': 'export {};',
		'pkg/src/plugins/nested/beta.ts': 'export {};',
		'pkg/src/plugins/readme.json': '{}',
		'pkg/src/other.ts': 'export {};',
		'pkg/test/loader.test.ts': "import { load } from '../src/loader.ts'; load;",
	};

	test('a template import() is an edge to every file its static prefix and suffix match', async () => {
		const graph = await graphOf({ files });
		expect(graph.opaque.has('pkg/src/loader.ts')).toBe(false);
		expect(graph.dependenciesOf('pkg/src/loader.ts').sort()).toEqual([
			'pkg/src/name.ts',
			'pkg/src/plugins/alpha.ts',
			'pkg/src/plugins/nested/beta.ts',
		]);
		const tests = testsIn(files);
		expect(graph.affectedTests(['pkg/src/plugins/nested/beta.ts'], tests)).toEqual({
			tests: ['pkg/test/loader.test.ts'],
			runAll: null,
		});
		expect(graph.affectedTests(['pkg/src/name.ts'], tests)).toEqual({
			tests: ['pkg/test/loader.test.ts'],
			runAll: null,
		});
		expect(graph.affectedTests(['pkg/src/other.ts'], tests)).toEqual({
			tests: [],
			runAll: null,
		});
	});

	test('string concatenation, require(), new URL() and a .js suffix resolve the same way', async () => {
		const graph = await graphOf({
			files: {
				'app/sum.ts':
					"export const a = (n: string) => import('./parts/' + n + '.js');\n" +
					'export const b = (n: string) => require(`./parts/${n}`);\n' +
					'export const c = (n: string) => new URL(`assets/${n}.svg`, import.meta.url);',
				'app/parts/one.ts': 'export {};',
				'app/parts/two/index.ts': 'export {};',
				'app/elsewhere.ts': 'export {};',
			},
			assets: ['app/assets/icon.svg', 'app/assets/icon.png'],
		});
		expect(graph.opaque.has('app/sum.ts')).toBe(false);
		expect(graph.dependenciesOf('app/sum.ts').sort()).toEqual([
			'app/assets/icon.svg',
			'app/parts/one.ts',
			'app/parts/two/index.ts',
		]);
	});

	test('a query on a computed specifier ends its path; a data: URL names no repo file', async () => {
		const graph = await graphOf({
			files: {
				'pkg/a.ts':
					'export const a = (n: string) => import(`./mods/${n}.ts?t=${Date.now()}`);\n' +
					'export const b = (code: string) => import(`data:text/javascript,${code}`);',
				'pkg/mods/x.ts': 'export {};',
				'pkg/c.ts':
					'export const c = (file: string) => import(`${file}?preview=${Date.now()}`);',
			},
		});
		expect(graph.opaque.has('pkg/a.ts')).toBe(false);
		expect(graph.dependenciesOf('pkg/a.ts')).toEqual(['pkg/mods/x.ts']);
		expect(graph.opaque.get('pkg/c.ts')).toEqual(['a computed import()']);
	});

	test('import.meta.glob patterns are edges, a root-absolute one under any folder', async () => {
		const graph = await graphOf({
			files: {
				'router/entry.ts':
					"export const docs = import.meta.glob(['/document.tsrx']);\n" +
					"export const pages = import.meta.glob('./pages/*.ts');",
				'router/pages/home.ts': 'export {};',
				'site/document.tsrx': 'export function Document() @{\n\t<html />\n}\n',
				'router/test/entry.test.ts': "import '../entry.ts';",
			},
		});
		expect(graph.opaque.has('router/entry.ts')).toBe(false);
		expect(graph.dependenciesOf('router/entry.ts').sort()).toEqual([
			'router/pages/home.ts',
			'site/document.tsrx',
		]);
		expect(
			graph.affectedTests(['site/document.tsrx'], ['router/test/entry.test.ts']).tests,
		).toEqual(['router/test/entry.test.ts']);
	});

	test("a root-absolute glob in a library package's src names the consumer app's files, not the repo's", async () => {
		const graph = await graphOf({
			files: {
				'packages/router/src/entry.ts':
					"export const pages = import.meta.glob('/pages/**/*.tsrx');\n" +
					"export const near = import.meta.glob('./parts/*.ts');",
				'packages/router/src/parts/a.ts': 'export {};',
				'website/pages/home.tsrx': 'export function Home() @{\n\t<p />\n}\n',
				'demos/app/src/entry.ts':
					"export const pages = import.meta.glob('/pages/**/*.tsrx');",
			},
			packages: [
				{ dir: 'packages/router', name: '@markless/router', exports: './src/entry.ts' },
				{ dir: 'demos/app', name: '@markless/demo-app' },
			],
		});
		expect(graph.opaque.has('packages/router/src/entry.ts')).toBe(false);
		expect(graph.dependenciesOf('packages/router/src/entry.ts')).toEqual([
			'packages/router/src/parts/a.ts',
		]);
		expect(graph.dependenciesOf('demos/app/src/entry.ts')).toEqual(['website/pages/home.tsrx']);
	});

	test('a workspace package prefix links every file in that package with the right ending', async () => {
		const graph = await graphOf({
			files: {
				'app/load.ts':
					'export const load = (n: string) => import(`@markless/web/fns/${n}`);',
				'packages/web/src/fns/format.ts': 'export {};',
				'packages/web/src/index.ts': 'export {};',
				'app/third.ts': 'export const t = (n: string) => import(`left-pad/${n}`);',
			},
			packages: [
				{
					dir: 'packages/web',
					name: '@markless/web',
					exports: { './fns/*': './src/fns/*.ts' },
				},
			],
		});
		expect(graph.opaque.size).toBe(0);
		expect(graph.dependenciesOf('app/load.ts').sort()).toEqual([
			'packages/web/src/fns/format.ts',
			'packages/web/src/index.ts',
		]);
		expect(graph.dependenciesOf('app/third.ts')).toEqual([]);
	});
});

describe('fails closed', () => {
	test('an unresolved local import inside the affected set runs everything', async () => {
		const files = {
			'pkg/src/a.ts':
				"import { gone } from './gone.ts'; import { b } from './b.ts'; export const a = gone + b;",
			'pkg/src/b.ts': 'export const b = 1;',
			'pkg/test/a.test.ts': "import { a } from '../src/a.ts'; a;",
			'pkg/test/c.test.ts': "import { c } from '../src/c.ts'; c;",
			'pkg/src/c.ts': 'export const c = 1;',
		};
		expect((await select({ files }, ['pkg/src/b.ts'])).runAll).toBe(
			"unresolved import: pkg/src/a.ts imports './gone.ts'",
		);
		expect(await select({ files }, ['pkg/src/c.ts'])).toEqual({
			tests: ['pkg/test/c.test.ts'],
			runAll: null,
		});
	});

	test('a test that reaches an undeclared fully dynamic import runs on any non-prose change', async () => {
		const files = {
			'pkg/src/loader.ts': 'export const load = (file: string) => import(file);',
			'pkg/test/loader.test.ts': "import { load } from '../src/loader.ts'; load;",
			'pkg/src/plain.ts': 'export const plain = 1;',
			'pkg/test/plain.test.ts': "import { plain } from '../src/plain.ts'; plain;",
			'other/src/unrelated.ts': 'export const unrelated = 1;',
		};
		const graph = await graphOf({ files });
		const tests = testsIn(files);
		expect(graph.testsReachingUndeclaredImports(tests)).toEqual(['pkg/test/loader.test.ts']);
		expect(graph.affectedTests(['other/src/unrelated.ts'], tests)).toEqual({
			tests: ['pkg/test/loader.test.ts'],
			runAll: null,
		});
		expect(graph.affectedTests(['pkg/src/plain.ts'], tests)).toEqual({
			tests: ['pkg/test/loader.test.ts', 'pkg/test/plain.test.ts'],
			runAll: null,
		});
		expect(graph.affectedTests(['docs/guide.md', 'CLAUDE.md'], tests)).toEqual({
			tests: [],
			runAll: null,
		});
	});

	test('a computed import() off every path to a test does not force a full run', async () => {
		const files = {
			'pkg/src/name.ts': "export const name = 'x';",
			'pkg/test/name.test.ts': "import { name } from '../src/name.ts'; name;",
			'site/page.ts': "import { name } from '../pkg/src/name.ts'; import(name);",
		};
		expect(await select({ files }, ['pkg/src/name.ts'])).toEqual({
			tests: ['pkg/test/name.test.ts'],
			runAll: null,
		});
	});

	test('a computed require() and a glob with no known root count as unknown targets', async () => {
		const graph = await graphOf({
			files: {
				'a.cjs': 'const name = "x"; module.exports = require(name);',
				'b.ts': "export const all = import.meta.glob('@/pages/*.ts');",
				'c.ts': "const fs = require('node:fs'); export { fs };",
				'd.ts': 'const pattern = "./*.ts"; export const all = import.meta.glob(pattern);',
			},
		});
		expect(graph.opaque.get('a.cjs')).toEqual(['a computed require()']);
		expect(graph.opaque.get('b.ts')).toEqual(['import.meta.glob()']);
		expect(graph.opaque.get('d.ts')).toEqual(['import.meta.glob()']);
		expect(graph.opaque.has('c.ts')).toBe(false);
	});

	test('a deleted module that is still imported runs everything', async () => {
		const files = {
			'pkg/src/a.ts': "import { gone } from './gone.ts'; export const a = gone;",
			'pkg/test/a.test.ts': "import { a } from '../src/a.ts'; a;",
		};
		expect((await select({ files }, ['pkg/src/gone.ts'])).runAll).toBe(
			"unresolved import: pkg/src/a.ts imports './gone.ts'",
		);
		expect(await select({ files }, ['pkg/src/never-imported.ts'])).toEqual({
			tests: [],
			runAll: null,
		});
	});
});

describe('path rules', () => {
	const files = {
		'packages/web/src/a.ts': 'export const a = 1;',
		'packages/web/test/a.test.ts': "import { a } from '../src/a.ts'; a;",
		'packages/web/test/b.test.ts': "import { readFileSync } from 'node:fs'; readFileSync;",
		'packages/bundler/test/build.test.ts': 'export {};',
		'packages/headless/components/test/menu.test.ts': 'export {};',
	};

	test('config, manifests, hooks, CI scripts and shared test helpers run everything', async () => {
		for (const path of [
			'pnpm-lock.yaml',
			'packages/web/package.json',
			'tsconfig.json',
			'vite.config.ts',
			'packages/web/vitest.config.ts',
			'.githooks/pre-commit',
			'scripts/ci/local.mjs',
			'scripts/test-utils/browser.ts',
			'packages/typescript-plugin/src/index.ts',
		]) {
			const selection = await select({ files }, [path]);
			expect(selection.runAll, path).toContain(path);
			expect(selection.tests).toHaveLength(4);
		}
	});

	test('a path no rule classifies runs everything', async () => {
		expect((await select({ files }, ['assets/logo.svg'])).runAll).toBe(
			'no rule classifies the path: assets/logo.svg',
		);
	});

	test('prose and editor settings select no unit test', async () => {
		expect(
			await select({ files }, [
				'docs/ci-process.md',
				'specs/12-arm-rendering.md',
				'CHANGELOG.md',
				'packages/web/README.md',
				'.agents/skills/x/SKILL.md',
				'.vscode/settings.json',
			]),
		).toEqual({ tests: [], runAll: null });
	});

	test('a markdown file a test reads from disk still selects that test', async () => {
		const readers = {
			...files,
			'packages/core/test/storage-types.test.ts': "import { readFileSync } from 'node:fs';",
			'packages/cli/test/script-binaries.test.ts':
				"import { readFile } from 'node:fs/promises';",
			'packages/compiler/test/sync-policy/key-cancel-guard.test.ts': "import 'node:fs';",
			'pkg/src/notes.ts': "import notes from './notes.md?raw'; export { notes };",
			'pkg/test/notes.test.ts': "import { notes } from '../src/notes.ts'; notes;",
		};
		const project = { files: readers, assets: ['pkg/src/notes.md'] };
		expect((await select(project, ['packages/core/agent/markless.md'])).tests).toEqual([
			'packages/core/test/storage-types.test.ts',
		]);
		expect((await select(project, ['packages/cli/templates/common/README.md'])).tests).toEqual([
			'packages/cli/test/script-binaries.test.ts',
		]);
		expect((await select(project, ['pkg/src/notes.md'])).tests).toEqual([
			'pkg/test/notes.test.ts',
		]);
		expect((await select(project, ['website/pages/home.tsrx'])).tests).toEqual([
			'packages/compiler/test/sync-policy/key-cancel-guard.test.ts',
		]);
		expect((await select(project, ['packages/web/test/fixtures/page.md'])).tests).toEqual([
			'packages/web/test/a.test.ts',
			'packages/web/test/b.test.ts',
		]);
	});

	test('agent rule sources select no unit test', async () => {
		expect(await select({ files }, ['.ruler/AGENTS.md', 'CLAUDE.md'])).toEqual({
			tests: [],
			runAll: null,
		});
	});

	test('a fixture under a package test folder runs that package, a test file runs itself', async () => {
		expect(await select({ files }, ['packages/web/test/fixtures/page.html'])).toEqual({
			tests: ['packages/web/test/a.test.ts', 'packages/web/test/b.test.ts'],
			runAll: null,
		});
		expect(
			(await select({ files }, ['packages/headless/components/test/fixtures/x.tsrx'])).tests,
		).toEqual(['packages/headless/components/test/menu.test.ts']);
		expect((await select({ files }, ['packages/web/test/b.test.ts'])).tests).toEqual([
			'packages/web/test/b.test.ts',
		]);
	});

	test('a snapshot runs the test it belongs to', async () => {
		expect(
			(await select({ files }, ['packages/web/test/__snapshots__/a.test.ts.snap'])).tests,
		).toEqual(['packages/web/test/a.test.ts']);
	});

	test('demos changes run the test folders that read them from disk; website changes only follow imports', async () => {
		expect((await select({ files }, ['demos/todomvc/src/App.tsrx'])).tests).toEqual([
			'packages/bundler/test/build.test.ts',
			'packages/web/test/a.test.ts',
			'packages/web/test/b.test.ts',
		]);
		expect(await select({ files }, ['website/pages/index.mdx'])).toEqual({
			tests: [],
			runAll: null,
		});
	});
});

describe('declared dynamic imports', () => {
	const files = {
		'fx/app/dev-server.ts':
			'export const serve = (dist: string) => import(`${dist}/server.js?t=${Date.now()}`);',
		'fx/app/root.ts': "import { web } from '@x/web'; export const root = web;",
		'packages/web/src/index.ts':
			"import { inner } from './inner.ts'; export const web = inner;",
		'packages/web/src/inner.ts': 'export const inner = 1;',
		'packages/web/src/lazy.ts': 'export const lazy = 1;',
		'packages/rt/src/index.ts': 'export const rt = 1;',
		'packages/other/src/index.ts': 'export const other = 1;',
		'pkg/test/serve.test.ts': "import { serve } from '../../fx/app/dev-server.ts'; serve;",
		'pkg/test/web.test.ts': "import { web } from '@x/web'; web;",
		'pkg/test/other.test.ts': "import { other } from '@x/other'; other;",
	};
	const packages: WorkspacePackage[] = [
		{
			dir: 'packages/web',
			name: '@x/web',
			exports: { '.': './src/index.ts', './lazy': './src/lazy.ts' },
			dependencies: { '@x/rt': 'workspace:*' },
		},
		{ dir: 'packages/rt', name: '@x/rt', exports: './src/index.ts' },
		{ dir: 'packages/other', name: '@x/other', exports: './src/index.ts' },
	];
	const declaration: DynamicImportDeclaration = {
		module: 'fx/app/dev-server.ts',
		sites: 1,
		loads: 'the build output of fx/app',
		buildRoots: ['fx/app'],
		packages: ['@x/web'],
	};
	const tests = testsIn(files);

	test('a change reachable only through a declared site selects the test', async () => {
		const graph = await graphOf({ files, packages, declarations: [declaration] });
		expect(graph.declared.has('fx/app/dev-server.ts')).toBe(true);
		expect(graph.testsReachingUndeclaredImports(tests)).toEqual([]);
		expect(graph.affectedTests(['fx/app/root.ts'], tests)).toEqual({
			tests: ['pkg/test/serve.test.ts'],
			runAll: null,
		});
		// An export no module imports, and a workspace dependency of a declared package.
		for (const changed of ['packages/web/src/lazy.ts', 'packages/rt/src/index.ts'])
			expect(graph.affectedTests([changed], tests), changed).toEqual({
				tests: ['pkg/test/serve.test.ts'],
				runAll: null,
			});
		expect(graph.affectedTests(['packages/web/src/inner.ts'], tests).tests).toEqual([
			'pkg/test/serve.test.ts',
			'pkg/test/web.test.ts',
		]);
	});

	test('a change to an unrelated package selects no test without an opaque site', async () => {
		const declared = await graphOf({ files, packages, declarations: [declaration] });
		expect(declared.affectedTests(['packages/other/src/index.ts'], tests)).toEqual({
			tests: ['pkg/test/other.test.ts'],
			runAll: null,
		});
		const undeclared = await graphOf({ files, packages, declarations: [] });
		expect(undeclared.affectedTests(['packages/other/src/index.ts'], tests)).toEqual({
			tests: ['pkg/test/other.test.ts', 'pkg/test/serve.test.ts'],
			runAll: null,
		});
	});

	test('a declared package also links src files no export reaches, but not its tests or fixtures', async () => {
		const graph = await graphOf({
			files: {
				...files,
				'packages/web/src/worker.ts': 'export const worker = 1;',
				'packages/web/test/fixtures/app.ts': 'export const app = 1;',
			},
			packages,
			declarations: [declaration],
		});
		const tests = testsIn(files);
		expect(graph.affectedTests(['packages/web/src/worker.ts'], tests).tests).toEqual([
			'pkg/test/serve.test.ts',
		]);
		expect(graph.affectedTests(['packages/web/test/fixtures/app.ts'], tests).tests).toEqual([]);
	});

	test('a declaration whose site count differs from the module leaves it undeclared', async () => {
		const graph = await graphOf({
			files: {
				...files,
				'fx/app/dev-server.ts':
					'export const serve = (dist: string) => import(`${dist}/server.js`);\n' +
					'export const again = (file: string) => import(file);',
			},
			packages,
			declarations: [declaration],
		});
		expect(graph.declared.has('fx/app/dev-server.ts')).toBe(false);
		expect(graph.affectedTests(['packages/other/src/index.ts'], tests).tests).toEqual([
			'pkg/test/other.test.ts',
			'pkg/test/serve.test.ts',
		]);
	});
});

describe('tests that host an app', () => {
	const files = {
		'packages/core/src/index.ts':
			"import { web } from '@markless/web'; export const core = web;",
		'packages/web/src/index.ts': 'export const web = 1;',
		'packages/ui/src/index.ts': 'export const ui = 1;',
		'packages/other/src/index.ts': 'export const other = 1;',
		'fx/app/root.ts': 'export const root = 1;',
		'pkg/test/serve.test.ts':
			"import { createServer as serve } from 'vite'; serve({ root: 'fx/app' });",
		'pkg/test/vite-ns.test.ts': "import * as vite from 'vite'; vite.build();",
		'pkg/test/config.test.ts':
			"import { defineConfig } from 'vite'; import type { ViteDevServer } from 'vite'; defineConfig({});",
		'pkg/test/spawn.test.ts':
			"import { execFile } from 'node:child_process'; execFile('vp', ['build']);",
	};
	const packages: WorkspacePackage[] = [
		{
			dir: 'packages/core',
			name: '@markless/core',
			exports: './src/index.ts',
			dependencies: { '@markless/web': 'workspace:*' },
		},
		{ dir: 'packages/web', name: '@markless/web', exports: './src/index.ts' },
		{ dir: 'packages/ui', name: '@markless/ui', exports: './src/index.ts' },
		{ dir: 'packages/other', name: '@markless/other', exports: './src/index.ts' },
	];
	const spawnedAppBuilds: SpawnedAppBuild[] = [
		{ test: 'pkg/test/spawn.test.ts', runs: '`vp build` in fx/app', buildRoots: ['fx/app'] },
	];
	const tests = testsIn(files);

	test("a test that starts Vite's server or builder is selected by the packages an app build bundles", async () => {
		const graph = await graphOf({ files, packages, spawnedAppBuilds: [] });
		for (const changed of [
			'packages/web/src/index.ts',
			'packages/core/src/index.ts',
			'packages/ui/src/index.ts',
		])
			expect(graph.affectedTests([changed], tests).tests, changed).toEqual([
				'pkg/test/serve.test.ts',
				'pkg/test/vite-ns.test.ts',
			]);
		expect(graph.affectedTests(['packages/other/src/index.ts'], tests).tests).toEqual([]);
	});

	test('a declared spawned build is selected by its app folder and the app-build packages while it still starts a child process', async () => {
		const graph = await graphOf({ files, packages, spawnedAppBuilds });
		expect(graph.appBuilds.has('pkg/test/spawn.test.ts')).toBe(true);
		expect(graph.affectedTests(['fx/app/root.ts'], tests).tests).toEqual([
			'pkg/test/spawn.test.ts',
		]);
		expect(graph.affectedTests(['packages/web/src/index.ts'], tests).tests).toContain(
			'pkg/test/spawn.test.ts',
		);
		const stale = await graphOf({
			files: { ...files, 'pkg/test/spawn.test.ts': "import 'node:fs';" },
			packages,
			spawnedAppBuilds,
		});
		expect(stale.appBuilds.has('pkg/test/spawn.test.ts')).toBe(false);
		expect(stale.affectedTests(['fx/app/root.ts'], tests).tests).toEqual([]);
	});
});

describe("this repo's declarations", () => {
	const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
	let graph: ProjectGraph;
	beforeAll(async () => {
		({ graph } = await loadProjectGraph(repoRoot));
	}, 60_000);

	test(
		'every declaration matches the fully dynamic site count of its module',
		{ timeout: 60_000 },
		async () => {
			const lapsed = DYNAMIC_IMPORT_DECLARATIONS.filter(
				(declaration) => !graph.declared.has(declaration.module),
			).map(
				(declaration) =>
					`${declaration.module}: ${declaration.sites} declared, ${graph.opaque.get(declaration.module)?.length ?? 0} found`,
			);
			expect(lapsed).toEqual([]);
		},
	);

	test('every spawned app build still starts a child process', { timeout: 60_000 }, async () => {
		expect(SPAWNED_APP_BUILDS.filter((build) => !graph.appBuilds.has(build.test))).toEqual([]);
	});

	test(
		'tests that build an app from a folder they name are selected by bundler, router and compiler changes',
		{ timeout: 60_000 },
		async () => {
			// Each of these failed when an export of the changed module threw.
			const building = [
				'packages/bundler/test/direct-render-startup.test.ts',
				'packages/bundler/test/native-packing-fixtures.test.ts',
				'packages/bundler/test/node-in-browser-fixture.test.ts',
				'packages/bundler/test/prerender-arm-children.test.ts',
				'packages/bundler/test/prerender-late-event-types.test.ts',
				'packages/bundler/test/stream-adoption-race.test.ts',
				'packages/cli/test/starter-build.test.ts',
				'packages/router/test/vite/dev-server-close.test.ts',
				'packages/router/test/vite/vite-future-deprecations.test.ts',
				'packages/vitest-browser/test/ssr-module-cache-rerun.test.ts',
			];
			for (const changed of [
				'packages/bundler/src/hooks/resolve-load.ts',
				'packages/router/src/vite/index.ts',
				'packages/compiler/src/compile-module.ts',
			])
				expect(
					graph.affectedTests([changed], building, { ignoreUndeclaredImports: true })
						.tests,
					changed,
				).toEqual(building);
		},
	);

	test(
		'a runtime file only the build loads selects the tests that reach the resume loader',
		{ timeout: 60_000 },
		async () => {
			const reaching = 'packages/web/test/inline-defer-rejected-resume.test.ts';
			const fixtureTest = 'packages/bundler/test/ssr-updates-fixture.test.ts';
			const tests = [reaching, fixtureTest, 'packages/analyzer/test/project-graph.test.ts'];
			for (const changed of [
				'packages/web/src/inline/payload-document.ts',
				'packages/bundler/src/build-worker.ts',
				'packages/headless/components/src/index.ts',
			])
				expect(
					graph.affectedTests([changed], tests, { ignoreUndeclaredImports: true }).tests,
					changed,
				).toEqual([fixtureTest, reaching]);
			expect(
				graph.affectedTests(
					['packages/bundler/fixtures/vite-ssr-updates/src/root.tsrx'],
					tests,
					{
						ignoreUndeclaredImports: true,
					},
				).tests,
			).toEqual([fixtureTest]);
		},
	);
});

describe('disk readers found by tracing the declared tests', () => {
	const files = {
		'packages/bundler/test/fixture-builds.test.ts': "import 'node:fs';",
		'packages/bundler/test/render-order-sweep.test.ts': "import 'node:fs';",
	};

	test('anchor-change records select fixture-builds, headless component files select the sweep', async () => {
		expect(
			(await select({ files }, ['scripts/benchmarks/anchor-changes/fix-x.json'])).tests,
		).toEqual(['packages/bundler/test/fixture-builds.test.ts']);
		expect(
			(await select({ files }, ['packages/headless/components/chaos/run.json'])).tests,
		).toEqual(['packages/bundler/test/render-order-sweep.test.ts']);
	});
});
