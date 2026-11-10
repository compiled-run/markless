// One yuku module graph over the whole repo, used to pick the node-project tests a change can reach.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import { dirname, join, matchesGlob, normalize, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Analyzer, Module } from 'yuku/analyzer';

export type WorkspacePackage = { dir: string; name: string; exports?: unknown; main?: string };

export type ProjectGraphInput = {
	/** Repo-relative path to source, for every tracked file the analyzer parses. */
	files: ReadonlyMap<string, string | Uint8Array>;
	/** Every tracked repo-relative path, code or not. */
	tracked: ReadonlySet<string>;
	packages: readonly WorkspacePackage[];
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

/** Folders that tests read from disk, and the test folders that read them, until tests declare their own disk inputs. */
export const DISK_INPUT_READERS: readonly { glob: string; tests: readonly string[] }[] = [
	{ glob: 'demos/**', tests: ['packages/bundler/', 'packages/web/', 'scripts/benchmarks/'] },
	// No node-project test reads the website from disk; its modules still reach tests through imports.
	{ glob: 'website/**', tests: [] },
];

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
const exportTargets = (exports: unknown, subpath: string): string[] => {
	const leaves = (value: unknown): string[] => {
		if (typeof value === 'string') return [value];
		if (Array.isArray(value)) return value.flatMap(leaves);
		if (value && typeof value === 'object') return Object.values(value).flatMap(leaves);
		return [];
	};
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

const isStaticSource = (node: { type: string; expressions?: unknown[] }) =>
	node.type === 'Literal' || (node.type === 'TemplateLiteral' && node.expressions?.length === 0);

const literalValue = (node: {
	type: string;
	value?: unknown;
	quasis?: { value: { cooked: string } }[];
}) =>
	node.type === 'Literal'
		? typeof node.value === 'string'
			? node.value
			: null
		: (node.quasis?.[0]?.value.cooked ?? null);

type AstNode = { type: string; [key: string]: any };

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
		options: { ignoreComputedImports?: boolean } = {},
	): Selection {
		const tests = new Set(testFiles);
		const selected = new Set<string>();
		const seeds: string[] = [];
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

			const snapshot = SNAPSHOT.exec(path);
			if (snapshot) {
				const test = `${snapshot[1]}/${snapshot[2]}`;
				if (tests.has(test)) {
					selected.add(test);
					continue;
				}
			}

			let classified = false;
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
			const opaque = this.opaque.get(path);
			if (opaque && !options.ignoreComputedImports)
				return runAll(`computed import: ${path} has ${opaque[0]}`);
		}
		for (const test of reached) selected.add(test);
		return { tests: [...selected].sort(), runAll: null };
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

	const analyzer = new TsrxAnalyzer({ resolve });
	graph = new ProjectGraph(analyzer, input.tracked);
	for (const [path, source] of input.files) {
		const module = analyzer.setFile(path, source);
		scanImportSites(graph, module, resolve);
	}
	analyzer.link();
	return graph;
}

// Reads AST facts the import records lack: computed import targets and `new URL(literal, import.meta.url)` files.
const scanImportSites = (
	graph: ProjectGraph,
	module: Module,
	resolve: (specifier: string, importer: string) => string | false | null,
) => {
	const opaque: string[] = [];
	for (const node of module.findAll('ImportExpression') as AstNode[])
		if (!isStaticSource(node.source)) opaque.push('a computed import()');
	for (const node of module.findAll('CallExpression') as AstNode[]) {
		const callee = node.callee as AstNode;
		if (isImportMetaMember(callee, 'glob')) opaque.push('import.meta.glob()');
		else if (
			callee.type === 'Identifier' &&
			callee.name === 'require' &&
			!module.referenceOf(callee as never)?.binding &&
			node.arguments[0] &&
			!isStaticSource(node.arguments[0])
		)
			opaque.push('a computed require()');
		else if (isImportMetaMember(callee, 'resolve') && node.arguments[0]) {
			const target = literalValue(node.arguments[0]);
			if (target !== null) addReference(graph, module.path, target, resolve);
		}
	}
	for (const node of module.findAll('NewExpression') as AstNode[]) {
		const [first, second] = node.arguments as AstNode[];
		if (
			node.callee.type === 'Identifier' &&
			node.callee.name === 'URL' &&
			first &&
			isStaticSource(first) &&
			isImportMetaMember(second, 'url')
		) {
			const target = literalValue(first);
			if (target !== null) addReference(graph, module.path, target, resolve);
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
