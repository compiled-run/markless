// One yuku module graph over the whole repo, used to pick the node-project tests a change can reach.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import { dirname, join, matchesGlob, normalize, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Analyzer, Module } from 'yuku/analyzer';

export type WorkspacePackage = {
	dir: string;
	name: string;
	exports?: unknown;
	main?: string;
	dependencies?: Record<string, string>;
};

/** What a module's fully dynamic imports load, so the selector can follow them as edges. */
export type DynamicImportDeclaration = {
	module: string;
	/** The module's count of fully dynamic sites; any other count leaves the module undeclared. */
	sites: number;
	/** What the sites load, and the evidence for it. */
	loads: string;
	/** Vite roots whose build output the sites load: an edge to every tracked file under each. */
	buildRoots: readonly string[];
	/** Workspace packages the build bundles: an edge to each export target and `src/` code file, then the same for their workspace dependencies. */
	packages: readonly string[];
};

/** A test that builds or serves an app through a child process, which no import shows. */
export type SpawnedAppBuild = {
	test: string;
	/** What the child process runs. */
	runs: string;
	/** The app folders it builds: an edge to every tracked file under each. */
	buildRoots: readonly string[];
};

export type ProjectGraphInput = {
	/** Repo-relative path to source, for every tracked file the analyzer parses. */
	files: ReadonlyMap<string, string | Uint8Array>;
	/** Every tracked repo-relative path, code or not. */
	tracked: ReadonlySet<string>;
	packages: readonly WorkspacePackage[];
	/** Defaults to `DYNAMIC_IMPORT_DECLARATIONS`. */
	declarations?: readonly DynamicImportDeclaration[];
	/** Defaults to `SPAWNED_APP_BUILDS`. */
	spawnedAppBuilds?: readonly SpawnedAppBuild[];
};

export type Selection = { tests: string[]; runAll: string | null };

type PathRule = { glob: string; reason: string };

export const CODE_EXTENSIONS = [
	'.ts',
	'.tsx',
	'.mts',
	'.cts',
	'.tsrx',
	'.js',
	'.jsx',
	'.mjs',
	'.cjs',
] as const;

const TS_FOR_JS: Record<string, readonly string[]> = {
	'.js': ['.ts', '.tsx', '.tsrx'],
	'.jsx': ['.tsx'],
	'.mjs': ['.mts'],
	'.cjs': ['.cts'],
};

/** Changes that can alter how any test runs: they select every unit test. */
export const RUN_ALL_PATHS: readonly PathRule[] = [
	{ glob: 'pnpm-lock.yaml', reason: 'the lockfile changed' },
	{ glob: 'pnpm-workspace.yaml', reason: 'the workspace manifest changed' },
	{ glob: '.npmrc', reason: 'the package manager config changed' },
	{ glob: 'patches/**', reason: 'a dependency patch changed' },
	{ glob: '**/package.json', reason: 'a package manifest changed' },
	{ glob: '**/tsconfig*.json', reason: 'a tsconfig changed' },
	{ glob: '**/vite.config.*', reason: 'a Vite config changed' },
	{ glob: '**/vitest.config.*', reason: 'a Vitest config changed' },
	{ glob: '**/vitest.*.config.*', reason: 'a Vitest config changed' },
	{ glob: '.githooks/**', reason: 'a git hook changed' },
	{ glob: '.github/**', reason: 'a CI workflow changed' },
	{ glob: 'scripts/ci/**', reason: 'a CI script changed' },
	{ glob: 'scripts/test-utils/**', reason: 'a shared test helper changed' },
	{ glob: 'packages/typescript-plugin/**', reason: 'the TypeScript plugin changed' },
	{
		glob: 'packages/analyzer/test-support/project-graph.ts',
		reason: 'the test selector changed',
	},
];

/** Agent rules and their generated files: the agent-files job covers them, no unit test reads them. */
export const NO_UNIT_TEST_PATHS: readonly string[] = [
	'.ruler/**',
	'AGENTS.md',
	'CLAUDE.md',
	'.claude/skills/**',
	'.codex/skills/**',
	'.codex/config.toml',
	'.mcp.json',
];

/** Prose and editor settings: they select no test unless a graph edge or a disk reader below names them. */
export const PROSE_PATHS: readonly string[] = [
	'docs/**',
	'specs/**',
	'**/*.md',
	'.agents/**',
	'.vscode/**',
];

/** Folders that tests read from disk, and the test folders that read them, until tests declare their own disk inputs. */
export const DISK_INPUT_READERS: readonly { glob: string; tests: readonly string[] }[] = [
	{ glob: 'demos/**', tests: ['packages/bundler/', 'packages/web/', 'scripts/benchmarks/'] },
	{ glob: 'packages/cli/templates/**', tests: ['packages/cli/'] },
	{ glob: 'packages/cli/README.md', tests: ['packages/cli/'] },
	{ glob: 'packages/core/agent/**', tests: ['packages/core/test/storage-types.test.ts'] },
	{
		glob: 'packages/bundler/README.md',
		tests: ['packages/bundler/test/render-data-literals.test.ts'],
	},
	{
		glob: 'packages/headless/components/**',
		tests: ['packages/bundler/test/render-order-sweep.test.ts'],
	},
	{
		glob: 'scripts/benchmarks/anchor-changes/**',
		tests: ['packages/bundler/test/fixture-builds.test.ts'],
	},
	{ glob: '**/*.tsrx', tests: ['packages/compiler/test/sync-policy/key-cancel-guard.test.ts'] },
	// No node-project test reads the website from disk; its modules still reach tests through imports.
	{ glob: 'website/**', tests: [] },
];

// What a Markless app build can bundle: core's dependencies cover the runtime and the build tooling, ui the headless families tests build.
const APP_BUILD_PACKAGES = ['@markless/core', '@markless/ui'] as const;

// The app's own sources are the test's disk inputs, which the test-area and DISK_INPUT_READERS rules select.
const appBuildOutput = (
	module: string,
	sites: number,
	loads: string,
): DynamicImportDeclaration => ({
	module,
	sites,
	loads: `${loads} The app root is whichever one the running test builds or serves, so it adds no edge here.`,
	buildRoots: [],
	packages: APP_BUILD_PACKAGES,
});

const fixtureServerBuild = (
	test: string,
	sites: number,
	roots: readonly string[],
): DynamicImportDeclaration => ({
	module: test,
	sites,
	loads: `imports <fixture>/dist/server-render/server.js, the server build that \`vp build --app\` (or Vite's builder) writes for ${roots.join(' and ')}.`,
	buildRoots: roots,
	packages: APP_BUILD_PACKAGES,
});

const bundlerFixtureTests: readonly [name: string, sites: number, roots: readonly string[]][] = [
	['export-collision-fixture', 1, ['vite-csr-export-collision', 'vite-ssr-export-collision']],
	['ssr-action-scoped-lean-fixture', 1, ['vite-ssr-action-scoped-lean']],
	['ssr-arm-attribute-fixture', 1, ['vite-ssr-arm-attribute']],
	['ssr-body-local-rows-fixture', 1, ['vite-ssr-body-local-rows']],
	['ssr-closure-actions-fixture', 1, ['vite-ssr-closure-actions']],
	['ssr-constant-props-fixture', 1, ['vite-ssr-constant-props']],
	['ssr-idle-fixture', 2, ['vite-ssr-idle', 'vite-ssr-idle-wake']],
	['ssr-imported-rows-fixture', 1, ['vite-ssr-imported-rows']],
	['ssr-nested-rows-fixture', 1, ['vite-ssr-nested-rows']],
	['ssr-prerender-wake-fixture', 1, ['vite-ssr-prerender-wake']],
	['ssr-row-writes-fixture', 1, ['vite-ssr-row-writes']],
	['ssr-scalar-wake-fixture', 1, ['vite-ssr-scalar-wake']],
	['ssr-updates-fixture', 1, ['vite-ssr-updates']],
	['ssr-visible-element-fixture', 1, ['vite-ssr-visible-element']],
	['ssr-visible-fixture', 1, ['vite-ssr-visible']],
	['ssr-visible-wake-fixture', 1, ['vite-ssr-visible-wake']],
];

/** Fully dynamic import sites whose loads are known; a test that reaches an undeclared one runs on any non-prose change. */
export const DYNAMIC_IMPORT_DECLARATIONS: readonly DynamicImportDeclaration[] = [
	appBuildOutput(
		'packages/web/src/inline/defer.ts',
		1,
		"marklessDefer()'s loader imports the data-markless-resume-module URL of the running script: the resume module of a served Markless page, a client build of its app.",
	),
	appBuildOutput(
		'packages/web/src/fns/shared-instances.ts',
		1,
		"publish() wakes a dormant container by importing its script's data-markless-resume-module URL: the page's resume module.",
	),
	appBuildOutput(
		'packages/web/src/shared-swap.ts',
		1,
		"A swap imports the incoming page's resume-module attribute URL: the page's resume module.",
	),
	appBuildOutput(
		'packages/web/src/kept-swap.ts',
		1,
		"A kept swap imports the incoming page's resume-module attribute URL: the page's resume module.",
	),
	appBuildOutput(
		'packages/router/src/vite/entries/resume-entry.ts',
		1,
		"loadRouteResumeModule() imports the route script's built chunk URL, or the dev loader's URL for the route file: the route's resume module from the app build.",
	),
	appBuildOutput(
		'packages/bundler/src/build/delegate-loader.ts',
		3,
		'importSpecifier() imports what a delegate the build is compiling imports, once resolved: modules of the app being built or of the packages it depends on.',
	),
	appBuildOutput(
		'packages/bundler/src/link-driver.ts',
		1,
		'nodeImport() imports a delegate source file of the app being built, or of a package it depends on.',
	),
	appBuildOutput(
		'packages/bundler/src/build/prerender.ts',
		1,
		"withBuiltPrerenderPage() imports the prerender.js it just wrote: a rolldown build of the app's prerender entry with the server plugin.",
	),
	appBuildOutput(
		'packages/bundler/src/vite/client-build-process.ts',
		1,
		"imports request.vite, the installed vite entry resolved from the app root or beside the plugin (a lockfile change), then builds the app's client from its reloaded config.",
	),
	...bundlerFixtureTests.map(([name, sites, roots]) =>
		fixtureServerBuild(
			`packages/bundler/test/${name}.test.ts`,
			sites,
			roots.map((root) => `packages/bundler/fixtures/${root}`),
		),
	),
	fixtureServerBuild('packages/bundler/test/ssr-row-outer-read-fixture.test.ts', 1, [
		'packages/bundler/test/fixtures/vite-ssr-row-outer-read',
	]),
	{
		module: 'packages/bundler/fixtures/vite-ssr/src/dev-server.ts',
		sites: 1,
		loads: "fixtureSsrHost's preview server imports <config.root>/<build.outDir>/<builtRenderEntry ?? 'server/root.js'>: the server build of the Vite root that installs the host. Those roots are the folders of the Vite configs that import this module; tests that install it with a temp root bundle their own inline sources plus the workspace packages.",
		buildRoots: [
			'packages/bundler/fixtures/vite-ssr',
			'packages/bundler/fixtures/vite-ssr-async',
			'packages/bundler/fixtures/vite-ssr-branch',
			'packages/bundler/fixtures/vite-ssr-dispose',
			'packages/bundler/fixtures/vite-ssr-preloader',
			'packages/bundler/fixtures/vite-ssr-rows',
			'scripts/experiments/jev/advanced',
			'scripts/experiments/jev/modal-app',
		],
		// The vite-ssr fixture manifest's workspace dependencies.
		packages: ['@markless/bundler', '@markless/core'],
	},
	{
		module: 'packages/bundler/test/render-data-capabilities.test.ts',
		sites: 1,
		loads: "imports <mkdtemp root>/out/<chunk>: the output of a vite build() over sources the test writes itself, compiled by markless() with marklessSourceAliases, which maps @markless/core, web, runtime, serializer and the bundler's rolldown/preload/vite subpaths to their sources.",
		buildRoots: [],
		packages: [
			'@markless/bundler',
			'@markless/core',
			'@markless/runtime',
			'@markless/serializer',
			'@markless/web',
		],
	},
];

/** Imports that start a Vite or Vitest host in process; the app config it loads, which no import names, bundles the Markless packages. */
export const APP_HOST_IMPORTS: Readonly<Record<string, readonly string[]>> = {
	vite: ['build', 'createBuilder', 'createServer', 'preview'],
	'vite-plus': ['build', 'createBuilder', 'createServer', 'preview'],
	'vitest/node': ['createVitest', 'startVitest'],
};

// A namespace, dynamic or required import of a host module can reach the host API without naming it.
const HOST_IMPORT_KINDS = new Set(['namespace', 'dynamic', 'require', 'importEquals']);

const CHILD_PROCESS_MODULES = new Set(['node:child_process', 'child_process']);

/** Tests that build or serve an app through a child process; an entry whose test no longer imports node:child_process is not applied. */
export const SPAWNED_APP_BUILDS: readonly SpawnedAppBuild[] = [
	{
		test: 'packages/bundler/test/stream-adoption-race.test.ts',
		runs: '`vp build --app` in its fixture folder',
		buildRoots: ['packages/bundler/test/fixtures/stream-adoption-race'],
	},
	{
		test: 'packages/vitest-browser/test/ssr-module-cache-rerun.test.ts',
		runs: "Vitest on packages/vitest-browser/vitest.config.ts, whose plugin builds a browser test's app",
		buildRoots: ['packages/vitest-browser'],
	},
	{
		test: 'packages/bundler/test/build-determinism.test.ts',
		runs: '`pnpm --dir demos/music-player build`',
		buildRoots: ['demos/music-player'],
	},
	{
		test: 'packages/bundler/test/fixture-builds.test.ts',
		runs: '`pnpm --filter <fixture> build` over the bundler fixtures',
		buildRoots: ['packages/bundler/fixtures'],
	},
	{
		test: 'packages/router/test/navigation-chunk.test.ts',
		runs: '`pnpm --filter @markless/fixture-router build`',
		buildRoots: ['packages/router/fixtures/router'],
	},
];

const hostsApp = (module: Module) =>
	module.imports.some(
		(record) =>
			!record.typeOnly &&
			record.specifier in APP_HOST_IMPORTS &&
			(record.kind === 'named'
				? APP_HOST_IMPORTS[record.specifier].includes(record.name ?? '')
				: HOST_IMPORT_KINDS.has(record.kind)),
	);

const startsChildProcess = (module: Module) =>
	module.imports.some(
		(record) => !record.typeOnly && CHILD_PROCESS_MODULES.has(record.specifier),
	);

// A file under one of these folders of a package can be a fixture that a test reads from disk.
const TEST_AREAS = new Set(['test', 'tests', 'fixtures', 'test-support', '__snapshots__']);
const SNAPSHOT = /^(.*)\/__snapshots__\/([^/]+)\.snap$/;

const matchesAny = (path: string, globs: readonly string[]) =>
	globs.some((glob) => matchesGlob(path, glob));

const extensionOf = (path: string) => {
	const slash = path.lastIndexOf('/');
	const dot = path.lastIndexOf('.');
	return dot > slash ? path.slice(dot) : '';
};

export const isCodePath = (path: string) =>
	(CODE_EXTENSIONS as readonly string[]).includes(extensionOf(path));

const isTestPath = (path: string) => /\.test\.[cm]?[jt]sx?$/.test(path);

const builtins = new Set(builtinModules);
const isExternalScheme = (specifier: string) =>
	/^(node|bun|virtual|data|https?|file):/.test(specifier) ||
	specifier.startsWith('\0') ||
	builtins.has(specifier) ||
	builtins.has(specifier.split('/')[0]);

const isInstalledPackagePath = (path: string) =>
	path.startsWith('node_modules/') || path.includes('/node_modules/');

const packageNameOf = (specifier: string) => {
	const parts = specifier.split('/');
	return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
};

/** Every file target an `exports` entry can map a subpath to, across all conditions. */
const leaves = (value: unknown): string[] => {
	if (typeof value === 'string') return [value];
	if (Array.isArray(value)) return value.flatMap(leaves);
	if (value && typeof value === 'object') return Object.values(value).flatMap(leaves);
	return [];
};

const exportTargets = (exports: unknown, subpath: string): string[] => {
	if (exports === undefined || exports === null) return [];
	const isSubpathMap =
		typeof exports === 'object' &&
		!Array.isArray(exports) &&
		Object.keys(exports).some((key) => key.startsWith('.'));
	const map = isSubpathMap ? (exports as Record<string, unknown>) : { '.': exports };
	if (subpath in map) return leaves(map[subpath]);
	for (const [key, value] of Object.entries(map)) {
		const star = key.indexOf('*');
		if (star === -1) continue;
		const prefix = key.slice(0, star);
		const suffix = key.slice(star + 1);
		if (!subpath.startsWith(prefix) || !subpath.endsWith(suffix)) continue;
		const middle = subpath.slice(prefix.length, subpath.length - suffix.length);
		return leaves(value).map((target) => target.replaceAll('*', middle));
	}
	return [];
};

type AstNode = { type: string; [key: string]: any };

/**
 * The static text of a specifier expression, split where runtime values go: `./pages/${name}.ts`
 * gives `['./pages/', '.ts']`, a string literal gives one part, and anything else gives null.
 */
const specifierParts = (node: AstNode | undefined): string[] | null => {
	if (!node) return null;
	if (node.type === 'Literal') return typeof node.value === 'string' ? [node.value] : null;
	if (node.type === 'TemplateLiteral')
		return (node.quasis as AstNode[]).map((quasi) => quasi.value.cooked ?? quasi.value.raw);
	if (node.type === 'BinaryExpression' && node.operator === '+') {
		const left = specifierParts(node.left) ?? ['', ''];
		const right = specifierParts(node.right) ?? ['', ''];
		return [...left.slice(0, -1), left.at(-1)! + right[0], ...right.slice(1)];
	}
	return null;
};

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A static tail without an extension can still load `<tail>.ts` or `<tail>/index.ts`.
const tailPattern = (tail: string) => {
	if (!tail) return '$';
	const extension = extensionOf(tail);
	const swaps = TS_FOR_JS[extension];
	if (swaps)
		return `${escapeRegExp(tail.slice(0, -extension.length))}(?:${[extension, ...swaps].map(escapeRegExp).join('|')})$`;
	if (extension) return `${escapeRegExp(tail)}$`;
	return `${escapeRegExp(tail)}(?:(?:/index)?(?:${CODE_EXTENSIONS.map(escapeRegExp).join('|')}))?$`;
};

const isImportMeta = (node: AstNode | undefined) =>
	node?.type === 'MetaProperty' && node.meta?.name === 'import' && node.property?.name === 'meta';

const isImportMetaMember = (node: AstNode | undefined, name: string) =>
	node?.type === 'MemberExpression' && isImportMeta(node.object) && node.property?.name === name;

const loadTsrxAnalyzer = async (): Promise<typeof Analyzer> => {
	// @tsrx/yuku, the yuku build with the TSRX dialect, is the compiler's dependency.
	const compilerManifest = fileURLToPath(new URL('../../compiler/package.json', import.meta.url));
	const entry = createRequire(compilerManifest).resolve('@tsrx/yuku');
	return ((await import(pathToFileURL(entry).href)) as { Analyzer: typeof Analyzer }).Analyzer;
};

export class ProjectGraph {
	readonly analyzer: Analyzer;
	/** Local specifiers the resolver could not map to a tracked file, per importer. */
	readonly unresolved = new Map<string, string[]>();
	/** Imports whose target the analyzer cannot know: a computed `import()`/`require()` or `import.meta.glob`. */
	readonly opaque = new Map<string, string[]>();
	/** Modules in `opaque` whose sites a `DynamicImportDeclaration` covers. */
	readonly declared = new Set<string>();
	/** Modules linked to the app-build packages: Vite or Vitest hosts, and applied `SpawnedAppBuild` tests. */
	readonly appBuilds = new Set<string>();
	/** Edges yuku does not model: non-code imports, extra export conditions and `new URL(..., import.meta.url)`. */
	readonly extraDependents = new Map<string, Set<string>>();
	private readonly tracked: ReadonlySet<string>;

	constructor(analyzer: Analyzer, tracked: ReadonlySet<string>) {
		this.analyzer = analyzer;
		this.tracked = tracked;
	}

	private readonly extraDependencies = new Map<string, Set<string>>();

	addExtraEdge(importer: string, target: string) {
		let dependents = this.extraDependents.get(target);
		if (!dependents) this.extraDependents.set(target, (dependents = new Set()));
		dependents.add(importer);
		let dependencies = this.extraDependencies.get(importer);
		if (!dependencies) this.extraDependencies.set(importer, (dependencies = new Set()));
		dependencies.add(target);
	}

	dependenciesOf(path: string): string[] {
		const module = this.analyzer.module(path);
		const dependencies = module ? module.dependencies.map((dependency) => dependency.path) : [];
		return [...dependencies, ...(this.extraDependencies.get(path) ?? [])];
	}

	dependentsOf(path: string): string[] {
		const module = this.analyzer.module(path);
		const dependents = module ? module.dependents.map((dependent) => dependent.path) : [];
		return [...dependents, ...(this.extraDependents.get(path) ?? [])];
	}

	/** The node-project tests a change to `changedPaths` can reach, or a `rule: detail` reason to run them all. */
	affectedTests(
		changedPaths: readonly string[],
		testFiles: readonly string[],
		options: { ignoreUndeclaredImports?: boolean } = {},
	): Selection {
		const tests = new Set(testFiles);
		const selected = new Set<string>();
		const seeds: string[] = [];
		let codeChanged = false;
		const selectFolder = (folder: string) => {
			for (const test of tests) if (test.startsWith(folder)) selected.add(test);
		};
		const runAll = (reason: string): Selection => ({
			tests: [...tests].sort(),
			runAll: reason,
		});

		for (const path of changedPaths) {
			const ruled = RUN_ALL_PATHS.find((rule) => matchesGlob(path, rule.glob));
			if (ruled) return runAll(`${ruled.reason}: ${path}`);
			if (matchesAny(path, NO_UNIT_TEST_PATHS)) continue;
			if (!matchesAny(path, PROSE_PATHS)) codeChanged = true;

			const snapshot = SNAPSHOT.exec(path);
			if (snapshot) {
				const test = `${snapshot[1]}/${snapshot[2]}`;
				if (tests.has(test)) {
					selected.add(test);
					continue;
				}
			}

			let classified = matchesAny(path, PROSE_PATHS);
			if (this.analyzer.module(path)) {
				seeds.push(path);
				classified = true;
			} else if (this.extraDependents.has(path)) {
				seeds.push(...this.extraDependents.get(path)!);
				classified = true;
			} else if (isCodePath(path) && !this.tracked.has(path)) {
				// A deleted module: its former importers now fail to resolve, which the closure check reports.
				for (const [importer, specifiers] of this.unresolved)
					if (
						specifiers.some((specifier) =>
							this.candidatesFor(importer, specifier).includes(path),
						)
					)
						seeds.push(importer);
				classified = true;
			}

			const area = testAreaOf(path);
			if (area && !(isTestPath(path) && this.analyzer.module(path))) {
				selectFolder(area);
				classified = true;
			}
			for (const reader of DISK_INPUT_READERS)
				if (matchesGlob(path, reader.glob)) {
					for (const folder of reader.tests) selectFolder(folder);
					classified = true;
				}
			if (!classified) return runAll(`no rule classifies the path: ${path}`);
		}

		const closure = new Set<string>();
		const queue = [...seeds];
		while (queue.length) {
			const path = queue.pop()!;
			if (closure.has(path)) continue;
			closure.add(path);
			queue.push(...this.dependentsOf(path));
		}
		const reached = [...closure].filter((path) => tests.has(path));
		// Only modules on a path from a change to a reached test can change that test's result.
		const onPath = new Set<string>();
		const stack = [...reached];
		while (stack.length) {
			const path = stack.pop()!;
			if (onPath.has(path) || !closure.has(path)) continue;
			onPath.add(path);
			stack.push(...this.dependenciesOf(path));
		}
		for (const path of [...onPath].sort()) {
			const missing = this.unresolved.get(path);
			if (missing) return runAll(`unresolved import: ${path} imports '${missing[0]}'`);
		}
		for (const test of reached) selected.add(test);
		// An undeclared fully dynamic import can load any file, so its tests run on any non-prose change.
		if (codeChanged && !options.ignoreUndeclaredImports)
			for (const test of this.testsReachingUndeclaredImports(testFiles)) selected.add(test);
		return { tests: [...selected].sort(), runAll: null };
	}

	/** Tests whose module closure holds a fully dynamic import site no declaration covers. */
	testsReachingUndeclaredImports(testFiles: readonly string[]): string[] {
		const tests = new Set(testFiles);
		const closure = new Set<string>();
		const queue = [...this.opaque.keys()].filter((path) => !this.declared.has(path));
		while (queue.length) {
			const path = queue.pop()!;
			if (closure.has(path)) continue;
			closure.add(path);
			queue.push(...this.dependentsOf(path));
		}
		return [...closure].filter((path) => tests.has(path)).sort();
	}

	/** The repo paths a local specifier could name, for matching a deleted file to its importers. */
	candidatesFor(importer: string, specifier: string): string[] {
		const base = localBase(importer, specifier);
		return base === null ? [] : probeCandidates(base);
	}
}

/** The package folder a test-area path belongs to, e.g. `packages/web/`, or null. */
const testAreaOf = (path: string): string | null => {
	const parts = path.split('/');
	const rootLength = parts[0] === 'packages' ? (parts[1] === 'headless' ? 3 : 2) : 0;
	if (rootLength && parts.length > rootLength + 1 && TEST_AREAS.has(parts[rootLength]))
		return `${parts.slice(0, rootLength).join('/')}/`;
	if (parts[0] === 'scripts' && parts.length > 2) return `scripts/${parts[1]}/`;
	return null;
};

const localBase = (importer: string, specifier: string): string | null => {
	const bare = specifier.replace(/[?#].*$/, '');
	if (bare === '.' || bare === '..' || bare.startsWith('./') || bare.startsWith('../'))
		return normalize(posix.join(posix.dirname(importer), bare));
	if (bare.startsWith('/')) return normalize(bare.slice(1));
	return null;
};

const probeCandidates = (base: string): string[] => {
	const extension = extensionOf(base);
	const swapped = (TS_FOR_JS[extension] ?? []).map(
		(replacement) => base.slice(0, -extension.length) + replacement,
	);
	return [
		base,
		...swapped,
		...CODE_EXTENSIONS.map((ext) => base + ext),
		...CODE_EXTENSIONS.map((ext) => `${base}/index${ext}`),
	];
};

/** Builds the graph from in-memory files: the hook, the dry run and the tests all come through here. */
export async function createProjectGraph(input: ProjectGraphInput): Promise<ProjectGraph> {
	const TsrxAnalyzer = await loadTsrxAnalyzer();
	const packagesByName = new Map(input.packages.map((pkg) => [pkg.name, pkg]));
	let graph: ProjectGraph;

	const recordUnresolved = (importer: string, specifier: string) => {
		const list = graph.unresolved.get(importer);
		if (list) list.push(specifier);
		else graph.unresolved.set(importer, [specifier]);
	};

	const probe = (importer: string, base: string, specifier: string): string | false | null => {
		for (const candidate of probeCandidates(base)) {
			if (!input.tracked.has(candidate)) continue;
			if (input.files.has(candidate)) return candidate;
			graph.addExtraEdge(importer, candidate);
			return false;
		}
		recordUnresolved(importer, specifier);
		return null;
	};

	const resolve = (specifier: string, importer: string): string | false | null => {
		if (isExternalScheme(specifier)) return false;
		const base = localBase(importer, specifier);
		if (base !== null && isInstalledPackagePath(base)) return false;
		if (base !== null) return probe(importer, base, specifier);
		const name = packageNameOf(specifier);
		const pkg = packagesByName.get(name);
		if (!pkg) return false;
		const subpath = `.${specifier.slice(name.length).replace(/[?#].*$/, '')}`;
		if (pkg.exports === undefined) {
			const fallback = subpath === '.' ? (pkg.main ?? 'index') : subpath;
			return probe(importer, normalize(posix.join(pkg.dir, fallback)), specifier);
		}
		const targets = exportTargets(pkg.exports, subpath)
			.map((target) => normalize(posix.join(pkg.dir, target)))
			.filter((target) => input.tracked.has(target));
		if (!targets.length) {
			recordUnresolved(importer, specifier);
			return null;
		}
		const primary = targets.find((target) => input.files.has(target));
		for (const target of targets) if (target !== primary) graph.addExtraEdge(importer, target);
		return primary ?? false;
	};

	const trackedPaths = [...input.tracked].filter((path) => !isInstalledPackagePath(path));
	const matching = (pattern: RegExp) => trackedPaths.filter((path) => pattern.test(path));

	const templateTargets = (
		importer: string,
		parts: string[],
		bareIsRelative = false,
	): string[] | null => {
		// A query or hash ends the file path: `${file}?t=${now}` names whatever `${file}` names.
		const cut = parts.findIndex((part) => /[?#]/.test(part));
		const path =
			cut === -1 ? parts : [...parts.slice(0, cut), parts[cut].replace(/[?#][^]*$/, '')];
		let prefix = path[0];
		if (/^(node|bun|virtual|data|https?):/.test(prefix) || prefix.startsWith('\0')) return [];
		if (
			bareIsRelative &&
			prefix &&
			!/^[./]/.test(prefix) &&
			!/^[a-z][a-z\d+.-]*:/i.test(prefix)
		)
			prefix = `./${prefix}`;
		const middle = path
			.slice(1, -1)
			.map((part) => `.*${escapeRegExp(part)}`)
			.join('');
		const tail = path.length > 1 ? `.*${tailPattern(path.at(-1)!)}` : '';
		const head = (base: string) => (path.length > 1 ? escapeRegExp(base) : tailPattern(base));
		if (prefix.startsWith('./') || prefix.startsWith('../')) {
			const joined = normalize(posix.join(posix.dirname(importer), prefix));
			const base = joined === '.' || joined === './' ? '' : joined;
			const directory = prefix.endsWith('/') && !base.endsWith('/') ? `${base}/` : base;
			return matching(new RegExp(`^${head(directory)}${middle}${tail}`));
		}
		// The Vite root is not known here, so a root-absolute path may sit under any folder.
		if (prefix.startsWith('/'))
			return matching(new RegExp(`(?:^|/)${head(prefix.slice(1))}${middle}${tail}`));
		if (!prefix) return null;
		const name = packageNameOf(prefix);
		if (prefix.length <= name.length)
			return input.packages.some((pkg) => pkg.name.startsWith(prefix)) ? null : [];
		const pkg = packagesByName.get(name);
		// `exports` can map a subpath anywhere in the package, so any file in it with the right ending counts.
		return pkg
			? matching(new RegExp(`^${escapeRegExp(`${pkg.dir}/`)}.*${tailPattern(path.at(-1)!)}`))
			: [];
	};

	const librarySources = input.packages
		.filter(
			(pkg) =>
				pkg.name.startsWith('@markless/') && /^packages\/(headless\/)?[^/]+$/.test(pkg.dir),
		)
		.map((pkg) => `${pkg.dir}/src/`);
	const packageSourceOf = (path: string) => librarySources.some((dir) => path.startsWith(dir));

	const globTargets = (importer: string, patterns: string[]): string[] | null => {
		const targets = new Set<string>();
		for (const pattern of patterns) {
			// Dropping a negative pattern only adds edges.
			if (pattern.startsWith('!')) continue;
			let glob: string;
			if (pattern.startsWith('./') || pattern.startsWith('../'))
				glob = normalize(posix.join(posix.dirname(importer), pattern));
			// Package source compiles into a consumer app's graph, whose root is a test's disk input.
			else if (pattern.startsWith('/') && packageSourceOf(importer)) continue;
			else if (pattern.startsWith('/')) glob = `**/${pattern.slice(1)}`;
			else return null;
			for (const path of trackedPaths) if (matchesGlob(path, glob)) targets.add(path);
		}
		return [...targets];
	};

	const exportedFiles = (pkg: WorkspacePackage): string[] => {
		if (pkg.exports === undefined) {
			const entry = probeCandidates(normalize(posix.join(pkg.dir, pkg.main ?? 'index'))).find(
				(candidate) => input.tracked.has(candidate),
			);
			return entry ? [entry] : [];
		}
		const isSubpathMap =
			typeof pkg.exports === 'object' &&
			!Array.isArray(pkg.exports) &&
			Object.keys(pkg.exports as object).some((key) => key.startsWith('.'));
		const values = isSubpathMap
			? Object.values(pkg.exports as Record<string, unknown>)
			: [pkg.exports];
		const files = new Set<string>();
		for (const leaf of values.flatMap(leaves)) {
			const target = normalize(posix.join(pkg.dir, leaf));
			const star = target.indexOf('*');
			if (star === -1) {
				if (input.tracked.has(target)) files.add(target);
				continue;
			}
			const [head, tail] = [target.slice(0, star), target.slice(star + 1)];
			for (const path of trackedPaths)
				if (path.startsWith(head) && path.endsWith(tail)) files.add(path);
		}
		return [...files];
	};

	const linkBuild = (
		module: string,
		buildRoots: readonly string[],
		packages: readonly string[],
	) => {
		const link = (target: string) => {
			if (target !== module) graph.addExtraEdge(module, target);
		};
		for (const root of buildRoots)
			for (const path of trackedPaths) if (path.startsWith(`${root}/`)) link(path);
		const names = [...packages];
		const seen = new Set<string>();
		while (names.length) {
			const name = names.pop()!;
			const pkg = packagesByName.get(name);
			if (!pkg || seen.has(name)) continue;
			seen.add(name);
			for (const path of exportedFiles(pkg)) link(path);
			// A build also loads source no export reaches: forked worker entries and runtime files the bundler maps by path.
			for (const path of trackedPaths)
				if (path.startsWith(`${pkg.dir}/src/`) && isCodePath(path)) link(path);
			names.push(...Object.keys(pkg.dependencies ?? {}));
		}
	};

	const declare = (declaration: DynamicImportDeclaration) => {
		if (graph.opaque.get(declaration.module)?.length !== declaration.sites) return;
		linkBuild(declaration.module, declaration.buildRoots, declaration.packages);
		graph.declared.add(declaration.module);
	};

	const analyzer = new TsrxAnalyzer({ resolve });
	graph = new ProjectGraph(analyzer, input.tracked);
	for (const [path, source] of input.files) {
		const module = analyzer.setFile(path, source);
		scanImportSites(graph, module, {
			resolve,
			templateTargets,
			globTargets,
			tracked: input.tracked,
		});
	}
	for (const declaration of input.declarations ?? DYNAMIC_IMPORT_DECLARATIONS)
		declare(declaration);
	for (const [path, module] of analyzer.modules)
		if (hostsApp(module)) {
			linkBuild(path, [], APP_BUILD_PACKAGES);
			graph.appBuilds.add(path);
		}
	for (const build of input.spawnedAppBuilds ?? SPAWNED_APP_BUILDS) {
		const module = analyzer.module(build.test);
		if (!module || !startsChildProcess(module)) continue;
		linkBuild(build.test, build.buildRoots, APP_BUILD_PACKAGES);
		graph.appBuilds.add(build.test);
	}
	analyzer.link();
	return graph;
}

type ImportSites = {
	resolve: (specifier: string, importer: string) => string | false | null;
	/** Tracked files a specifier with runtime parts can name; null when its static text pins no location. */
	templateTargets: (
		importer: string,
		parts: string[],
		bareIsRelative?: boolean,
	) => string[] | null;
	/** Tracked files an `import.meta.glob` pattern list matches; null for a pattern with no known root. */
	globTargets: (importer: string, patterns: string[]) => string[] | null;
	tracked: ReadonlySet<string>;
};

const isPlainLiteral = (node: AstNode | undefined) =>
	node?.type === 'Literal' ||
	(node?.type === 'TemplateLiteral' && node.expressions?.length === 0);

const PATH_MODULES = new Set(['node:path', 'path', 'pathe']);

/** `resolve(import.meta.dirname, 'helpers/build.ts')` with `resolve` or `join` from a path module: a file the module runs by path, such as a spawned script. */
const spawnedScriptTarget = (
	module: Module,
	node: AstNode,
	tracked: ReadonlySet<string>,
): string | null => {
	const callee = node.callee as AstNode;
	if (callee.type !== 'Identifier') return null;
	const binding = module.referenceOf(callee as never)?.binding;
	if (!binding) return null;
	const imported = module.imports.find((record) => record.local?.id === binding.id);
	if (
		!imported ||
		!PATH_MODULES.has(imported.specifier) ||
		!['resolve', 'join'].includes(imported.name ?? '')
	)
		return null;
	const [first, ...rest] = node.arguments as AstNode[];
	if (!isImportMetaMember(first, 'dirname') || first.computed || rest.length === 0) return null;
	const parts = rest.map((part) => (isPlainLiteral(part) ? specifierParts(part)![0] : null));
	if (parts.some((part) => part === null)) return null;
	const target = posix.normalize(posix.join(posix.dirname(module.path), ...(parts as string[])));
	return isCodePath(target) && tracked.has(target) ? target : null;
};

// Reads AST facts the import records lack: computed import targets, globs, `new URL(..., import.meta.url)` files and scripts run by path.
const scanImportSites = (graph: ProjectGraph, module: Module, sites: ImportSites) => {
	const opaque: string[] = [];
	const link = (targets: string[] | null, label: string) => {
		if (targets === null) opaque.push(label);
		else
			for (const target of targets)
				if (target !== module.path) graph.addExtraEdge(module.path, target);
	};
	const computedTargets = (node: AstNode, bareIsRelative = false) => {
		const parts = specifierParts(node);
		return parts && sites.templateTargets(module.path, parts, bareIsRelative);
	};
	for (const node of module.findAll('ImportExpression') as AstNode[])
		if (!isPlainLiteral(node.source)) link(computedTargets(node.source), 'a computed import()');
	for (const node of module.findAll('CallExpression') as AstNode[]) {
		const callee = node.callee as AstNode;
		const [first] = node.arguments as AstNode[];
		const script = spawnedScriptTarget(module, node, sites.tracked);
		if (script && script !== module.path) graph.addExtraEdge(module.path, script);
		if (isImportMetaMember(callee, 'glob')) {
			const patterns = (first?.type === 'ArrayExpression' ? first.elements : [first]).map(
				(element: AstNode | undefined) => specifierParts(element),
			);
			link(
				patterns.every((parts: string[] | null) => parts?.length === 1)
					? sites.globTargets(
							module.path,
							patterns.map((parts: string[]) => parts[0]),
						)
					: null,
				'import.meta.glob()',
			);
		} else if (
			callee.type === 'Identifier' &&
			callee.name === 'require' &&
			!module.referenceOf(callee as never)?.binding &&
			first &&
			!isPlainLiteral(first)
		)
			link(computedTargets(first), 'a computed require()');
		else if (isImportMetaMember(callee, 'resolve') && first) {
			const parts = specifierParts(first);
			if (parts?.length === 1) addReference(graph, module.path, parts[0], sites.resolve);
			else if (parts) link(computedTargets(first) ?? [], 'import.meta.resolve()');
		}
	}
	for (const node of module.findAll('NewExpression') as AstNode[]) {
		const [first, second] = node.arguments as AstNode[];
		if (
			node.callee.type === 'Identifier' &&
			node.callee.name === 'URL' &&
			first &&
			isImportMetaMember(second, 'url')
		) {
			const parts = specifierParts(first);
			if (parts?.length === 1) addReference(graph, module.path, parts[0], sites.resolve);
			else if (parts) link(computedTargets(first, true) ?? [], 'new URL()');
		}
	}
	if (opaque.length) graph.opaque.set(module.path, opaque);
};

const addReference = (
	graph: ProjectGraph,
	importer: string,
	specifier: string,
	resolve: (specifier: string, importer: string) => string | false | null,
) => {
	if (localBase(importer, specifier) === null) return;
	const before = graph.unresolved.get(importer)?.length ?? 0;
	const target = resolve(specifier, importer);
	if (target) graph.addExtraEdge(importer, target);
	// A URL that names a folder or a generated file is a disk read, not an import.
	const list = graph.unresolved.get(importer);
	if (list && list.length > before) {
		list.length = before;
		if (!before) graph.unresolved.delete(importer);
	}
};

const loadYaml = (root: string): { parse(text: string): unknown } => {
	for (const base of ['package.json', 'packages/cli/package.json']) {
		try {
			return createRequire(join(root, base))('yaml');
		} catch {
			continue;
		}
	}
	throw new Error('Cannot resolve the `yaml` package. Run `pnpm install` first.');
};

const git = (root: string, args: string[], input?: string) =>
	execFileSync('git', ['-C', root, ...args], {
		input,
		maxBuffer: 1 << 30,
	});

/** Reads the repo's files, from the working tree by default or from a commit with `rev`. */
export async function loadProjectGraph(
	root: string,
	options: { rev?: string } = {},
): Promise<{ graph: ProjectGraph; buildMs: number; fileCount: number }> {
	const started = performance.now();
	const tracked = new Set(
		(options.rev
			? git(root, ['ls-tree', '-r', '-z', '--name-only', options.rev])
			: git(root, ['ls-files', '-z'])
		)
			.toString('utf8')
			.split('\0')
			.filter(Boolean),
	);
	const wanted = [...tracked].filter(
		(path) =>
			isCodePath(path) || path === 'pnpm-workspace.yaml' || path.endsWith('package.json'),
	);
	const contents = new Map<string, Uint8Array>();
	if (options.rev) {
		const batch = git(
			root,
			['cat-file', '--batch'],
			wanted.map((path) => `${options.rev}:${path}`).join('\n') + '\n',
		);
		let offset = 0;
		for (const path of wanted) {
			const headerEnd = batch.indexOf(10, offset);
			const header = batch.subarray(offset, headerEnd).toString('utf8');
			const size = Number(header.split(' ')[2]);
			if (header.endsWith('missing') || Number.isNaN(size)) {
				offset = headerEnd + 1;
				continue;
			}
			contents.set(path, batch.subarray(headerEnd + 1, headerEnd + 1 + size));
			offset = headerEnd + 1 + size + 1;
		}
	} else {
		for (const path of wanted) {
			try {
				contents.set(path, readFileSync(join(root, path)));
			} catch {
				tracked.delete(path);
			}
		}
	}

	const text = (path: string) => Buffer.from(contents.get(path) ?? '').toString('utf8');
	const workspace = loadYaml(root).parse(text('pnpm-workspace.yaml')) as { packages?: string[] };
	const globs = workspace.packages ?? [];
	const packages: WorkspacePackage[] = [];
	for (const path of contents.keys()) {
		if (!path.endsWith('package.json')) continue;
		const dir = path === 'package.json' ? '.' : dirname(path);
		if (dir !== '.' && !matchesAny(dir, globs)) continue;
		try {
			const manifest = JSON.parse(text(path)) as WorkspacePackage;
			if (manifest.name) packages.push({ ...manifest, dir });
		} catch {
			continue;
		}
	}
	const files = new Map<string, Uint8Array>();
	for (const [path, source] of contents) if (isCodePath(path)) files.set(path, source);
	const graph = await createProjectGraph({ files, tracked, packages });
	return { graph, buildMs: performance.now() - started, fileCount: files.size };
}
