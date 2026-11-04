import { builtinModules } from 'node:module';
import { isCSSRequest, type Plugin } from 'vite';
import { relative } from 'pathe';
import { analyze, type Module, type Reference } from 'yuku/analyzer';
import { MARKLESS_VIRTUAL_PREFIX } from '../transform.ts';
import { STRING_EXPORT_QUERY } from '../virtual-ids.ts';

export const NODE_IN_BROWSER_ERROR = 'MARKLESS_NODE_IN_BROWSER';

// Vite resolves a Node built-in, or a file a package's "browser" field maps to false, to this id in a browser build.
const VITE_BROWSER_EXTERNAL = '__vite-browser-external';
// The dependency optimizer names a browser-externalized built-in `browser-external:<specifier>`.
const OPTIMIZER_BROWSER_EXTERNAL = 'browser-external:';

const builtinNames = builtinModules.filter((name) => !name.includes(':'));
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Specifiers that name a Node built-in: `node:*`, `bun:*`, or a bare built-in and its subpaths. */
export const NODE_BUILTIN_SPECIFIER = new RegExp(
	`^(?:node:|bun:|(?:${builtinNames.map(escape).join('|')})(?:/|$))`,
);

export function isNodeBuiltinSpecifier(specifier: string): boolean {
	return NODE_BUILTIN_SPECIFIER.test(specifier);
}

/** Free names that only exist in Node; a browser throws a ReferenceError on any of them. */
export const NODE_ONLY_GLOBALS = ['process', 'Buffer', 'global', '__dirname', '__filename', 'require'] as const;
const NODE_GLOBAL_WORD = new RegExp(`\\b(?:${NODE_ONLY_GLOBALS.join('|')})\\b`);

export interface NodeGlobalUse {
	readonly name: string;
	readonly line: number;
	readonly column: number;
	readonly code: string;
}

type AstNode = { readonly type: string; readonly start: number; readonly end: number } & Record<
	string,
	unknown
>;

function parsed(code: string): Module | undefined {
	for (const options of [
		{ lang: 'js', sourceType: 'module' },
		{ lang: 'js', sourceType: 'commonjs' },
		{ lang: 'ts', sourceType: 'module' },
	] as const) {
		const module = analyze(code, options);
		if (!module.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) return module;
	}
	return undefined;
}

function contains(outer: AstNode | undefined, inner: AstNode) {
	return !!outer && outer.start <= inner.start && inner.end <= outer.end;
}

// `typeof X` anywhere in `test`, so a branch that runs only where X exists counts as guarded.
function testsTypeof(module: Module, test: AstNode | undefined, name: string) {
	if (!test) return false;
	return module.unresolvedReferences.some((reference) => {
		const node = reference.node as unknown as AstNode;
		if (reference.name !== name || !contains(test, node)) return false;
		const parent = module.parentOf(reference.node) as unknown as AstNode | null;
		return parent?.type === 'UnaryExpression' && parent.operator === 'typeof';
	});
}

function allowedUse(module: Module, reference: Reference) {
	const node = reference.node as unknown as AstNode;
	const parent = module.parentOf(reference.node) as unknown as AstNode | null;
	if (parent?.type === 'UnaryExpression' && parent.operator === 'typeof') return true;
	const name = reference.name;
	if (
		name === 'process' &&
		parent?.type === 'MemberExpression' &&
		parent.object === reference.node &&
		!parent.computed &&
		(parent.property as AstNode & { name?: string }).name === 'env'
	)
		return true;
	// A bundler-resolved `require("x")`: the import rule judges what it reaches.
	if (
		name === 'require' &&
		parent?.type === 'CallExpression' &&
		parent.callee === reference.node &&
		(parent.arguments as AstNode[]).length === 1 &&
		(parent.arguments as AstNode[])[0]!.type === 'Literal' &&
		typeof (parent.arguments as Array<AstNode & { value?: unknown }>)[0]!.value === 'string'
	)
		return true;
	for (const ancestor of module.ancestors(reference.node) as Iterable<AstNode>) {
		if (ancestor === node) continue;
		if (
			(ancestor.type === 'ConditionalExpression' || ancestor.type === 'IfStatement') &&
			!contains(ancestor.test as AstNode, node) &&
			testsTypeof(module, ancestor.test as AstNode, name)
		)
			return true;
		if (
			ancestor.type === 'LogicalExpression' &&
			contains(ancestor.right as AstNode, node) &&
			testsTypeof(module, ancestor.left as AstNode, name)
		)
			return true;
	}
	return false;
}

function lineAndColumn(code: string, offset: number) {
	let line = 1;
	let lineStart = 0;
	for (let index = code.indexOf('\n'); index !== -1 && index < offset; index = code.indexOf('\n', index + 1)) {
		line++;
		lineStart = index + 1;
	}
	const lineEnd = code.indexOf('\n', offset);
	return {
		line,
		column: offset - lineStart + 1,
		code: code.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim().slice(0, 120),
	};
}

/**
 * The places `code` uses a Node-only global a browser does not have. `typeof X`, a branch that runs
 * only after testing `typeof X`, `process.env` (Vite replaces it, Vitest's browser runner provides
 * it) and a literal `require("x")` (the bundler resolves it) are allowed.
 */
export function nodeGlobalUses(code: string): NodeGlobalUse[] {
	if (!NODE_GLOBAL_WORD.test(code)) return [];
	const module = parsed(code);
	if (!module) return [];
	const uses: NodeGlobalUse[] = [];
	for (const reference of module.unresolvedReferences) {
		if (!(NODE_ONLY_GLOBALS as readonly string[]).includes(reference.name)) continue;
		if (reference.inTypePosition) continue;
		if (allowedUse(module, reference)) continue;
		const node = reference.node as unknown as AstNode;
		uses.push({ name: reference.name, ...lineAndColumn(code, node.start) });
	}
	return uses;
}

export interface ChainLink {
	readonly id: string;
	readonly dynamic: boolean;
}

export interface ImporterGraph {
	importers(id: string): { readonly static: readonly string[]; readonly dynamic: readonly string[] };
	isEntry(id: string): boolean;
}

/** The shortest import chain from an entry to `id`, entry first; a link is `dynamic` when reached by `import()`. */
export function importChain(graph: ImporterGraph, id: string): ChainLink[] {
	const reachedFrom = new Map<string, { toward: string; dynamic: boolean } | null>([[id, null]]);
	const queue = [id];
	let root = id;
	for (let index = 0; index < queue.length; index++) {
		const current = queue[index]!;
		const { static: staticImporters, dynamic } = graph.importers(current);
		if (graph.isEntry(current) || (staticImporters.length === 0 && dynamic.length === 0)) {
			root = current;
			break;
		}
		for (const [importers, isDynamic] of [
			[staticImporters, false],
			[dynamic, true],
		] as const) {
			for (const importer of importers) {
				if (reachedFrom.has(importer)) continue;
				reachedFrom.set(importer, { toward: current, dynamic: isDynamic });
				queue.push(importer);
			}
		}
	}
	const chain: ChainLink[] = [{ id: root, dynamic: false }];
	for (let step = reachedFrom.get(root); step; step = reachedFrom.get(step.toward)) {
		chain.push({ id: step.toward, dynamic: step.dynamic });
	}
	return chain;
}

export type NodeInBrowserViolation =
	| { readonly kind: 'builtin'; readonly importer: string; readonly specifier: string }
	| { readonly kind: 'browser-field'; readonly importer: string }
	| { readonly kind: 'global'; readonly importer: string; readonly use: NodeGlobalUse };

function displayId(id: string, root: string) {
	const clean = id.replace(/^\0/, '').replace(/\?.*$/, '');
	const relativeToRoot = (path: string) => (path.startsWith('/') && root ? relative(root, path) : path);
	if (clean.startsWith(MARKLESS_VIRTUAL_PREFIX)) {
		const [kind = '', ...source] = clean.slice(MARKLESS_VIRTUAL_PREFIX.length).split(':');
		const file = decodeURIComponent(source.join(':'));
		return `${relativeToRoot(file)} (Markless ${kind.replaceAll('-', ' ')} module)`;
	}
	return relativeToRoot(clean);
}

const FINDING_ORDER = { builtin: 0, 'browser-field': 1, global: 2 } as const;

function compareFindings(a: NodeInBrowserViolation, b: NodeInBrowserViolation): number {
	if (a.kind !== b.kind) return FINDING_ORDER[a.kind] - FINDING_ORDER[b.kind];
	if (a.kind === 'global' && b.kind === 'global')
		return a.use.line - b.use.line || a.use.column - b.use.column;
	if (a.kind === 'builtin' && b.kind === 'builtin')
		return a.specifier < b.specifier ? -1 : a.specifier > b.specifier ? 1 : 0;
	return 0;
}

function describeFinding(violation: NodeInBrowserViolation) {
	switch (violation.kind) {
		case 'builtin':
			return `imports "${violation.specifier}", a Node built-in module`;
		case 'browser-field':
			return 'imports a module its package removes from browser builds (its package.json "browser" field maps it to false)';
		case 'global':
			return `uses \`${violation.use.name}\` at ${violation.use.line}:${violation.use.column}, a global only Node has: ${violation.use.code}`;
	}
}

/** The error a browser build fails with: each import chain once, what its last module does, then how to fix it. */
export function nodeInBrowserMessage(
	environment: string,
	violations: readonly NodeInBrowserViolation[],
	chainOf: (id: string) => readonly ChainLink[],
	root: string,
): string {
	const byImporter = new Map<string, NodeInBrowserViolation[]>();
	for (const violation of violations) {
		const list = byImporter.get(violation.importer) ?? [];
		list.push(violation);
		byImporter.set(violation.importer, list);
	}
	const sections = [...byImporter].map(([importer, findings]) => {
		const lines = chainOf(importer).map((link, index) => {
			const arrow = index === 0 ? '  ' : link.dynamic ? '  → import() ' : '  → ';
			return `${arrow}${displayId(link.id, root)}`;
		});
		// Imports resolve concurrently, so findings are ordered by what they name, not by when they were recorded.
		const described = [...new Set(findings.toSorted(compareFindings).map(describeFinding))];
		return [...lines, ...described.map((finding) => `      ${finding}`)].join('\n');
	});
	return [
		`${NODE_IN_BROWSER_ERROR}: Node-only code is reachable from the browser build ("${environment}").`,
		'',
		sections.join('\n\n'),
		'',
		'A browser cannot run Node code: Vite would ship an empty stand-in that breaks when it is used.',
		'Fix: move what the browser side needs (a constant, a type, a pure function) into a module that imports nothing from Node, and import that module instead. Keep Node work in server-only files.',
	].join('\n');
}

function isBrowserExternal(id: string) {
	return id === VITE_BROWSER_EXTERNAL || id.startsWith(`${VITE_BROWSER_EXTERNAL}:`);
}

type GuardedEnvironment = {
	readonly name: string;
	readonly mode?: string;
	readonly config: {
		readonly consumer: string;
		readonly root: string;
	};
	readonly depsOptimizer?: { isOptimizedDepFile(id: string): boolean };
	readonly moduleGraph?: {
		getModuleById(id: string): { readonly importers: ReadonlySet<{ readonly id: string | null }> } | undefined;
	};
};

export function guardsEnvironment(environment: GuardedEnvironment) {
	return environment.config.consumer === 'client';
}

function devChain(environment: GuardedEnvironment, id: string): ChainLink[] {
	const graph = environment.moduleGraph;
	return importChain(
		{
			importers: (current) => ({
				static: [...(graph?.getModuleById(current)?.importers ?? [])]
					.map((node) => node.id)
					.filter((importer): importer is string => !!importer),
				dynamic: [],
			}),
			isEntry: () => false,
		},
		id,
	);
}

// Rolldown's helper module: its Node-only helpers are emitted only for Node output.
const ROLLDOWN_RUNTIME = '\0rolldown/runtime.js';

/**
 * Fails every browser build, worker bundle and dev request that reaches a Node built-in, a module
 * Vite would replace with an empty browser stand-in, or a global only Node has.
 */
export function browserNodeGuard(): Plugin {
	const violationsByEnvironment = new Map<string, NodeInBrowserViolation[]>();
	const record = (environment: string, violation: NodeInBrowserViolation) => {
		const list = violationsByEnvironment.get(environment) ?? [];
		list.push(violation);
		violationsByEnvironment.set(environment, list);
	};
	let root = '';
	return {
		name: 'markless:browser-node-guard',
		enforce: 'pre',
		applyToEnvironment(environment) {
			return guardsEnvironment(environment as unknown as GuardedEnvironment);
		},
		configEnvironment(name, config) {
			const consumer = config.consumer ?? (name === 'client' ? 'client' : 'server');
			if (consumer !== 'client') return undefined;
			return {
				optimizeDeps: { rolldownOptions: { plugins: [optimizedDepsGuard(name, () => root)] } },
			};
		},
		configResolved(config) {
			root = config.root;
		},
		config() {
			return { worker: { plugins: () => [browserNodeGuard()] } };
		},
		buildStart() {
			violationsByEnvironment.delete(this.environment.name);
		},
		resolveId: {
			order: 'pre',
			filter: { id: NODE_BUILTIN_SPECIFIER },
			async handler(source, importer, options) {
				if (!importer) return null;
				const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
				if (!resolved) return null;
				const reachesNode =
					isBrowserExternal(resolved.id) ||
					(resolved.external !== false &&
						resolved.external !== undefined &&
						isNodeBuiltinSpecifier(resolved.id));
				if (!reachesNode) return resolved;
				const environment = this.environment as unknown as GuardedEnvironment;
				const violation = { kind: 'builtin', importer, specifier: source } as const;
				if (environment.mode === 'dev') {
					throw new Error(
						nodeInBrowserMessage(
							environment.name,
							[violation],
							(id) => devChain(environment, id),
							environment.config.root,
						),
					);
				}
				record(environment.name, violation);
				return resolved;
			},
		},
		transform: {
			order: 'post',
			filter: { code: NODE_GLOBAL_WORD },
			handler(code, id) {
				if (id === ROLLDOWN_RUNTIME || isCSSRequest(id) || STRING_EXPORT_QUERY.test(id)) return null;
				const environment = this.environment as unknown as GuardedEnvironment;
				// A pre-bundled dependency's globals are checked by the build, which bundles it from source.
				if (environment.depsOptimizer?.isOptimizedDepFile(id)) return null;
				const uses = nodeGlobalUses(code);
				if (uses.length === 0) return null;
				const violations = uses.map((use) => ({ kind: 'global', importer: id, use }) as const);
				if (environment.mode === 'dev') {
					throw new Error(
						nodeInBrowserMessage(
							environment.name,
							violations,
							(target) => devChain(environment, target),
							environment.config.root,
						),
					);
				}
				for (const violation of violations) record(environment.name, violation);
				return null;
			},
		},
		buildEnd(error) {
			if (error) return;
			const environment = this.environment as unknown as GuardedEnvironment;
			const violations = [...(violationsByEnvironment.get(environment.name) ?? [])];
			violationsByEnvironment.delete(environment.name);
			const recorded = new Set(
				violations.map((violation) =>
					violation.kind === 'builtin' ? `${violation.importer}\0${violation.specifier}` : '',
				),
			);
			const explained = new Set(
				violations.filter((violation) => violation.kind === 'builtin').map((violation) => violation.importer),
			);
			for (const importer of this.getModuleIds()) {
				const info = this.getModuleInfo(importer);
				for (const id of [...(info?.importedIds ?? []), ...(info?.dynamicallyImportedIds ?? [])]) {
					if (isNodeBuiltinSpecifier(id)) {
						if (!recorded.has(`${importer}\0${id}`))
							violations.push({ kind: 'builtin', importer, specifier: id });
					} else if (isBrowserExternal(id) && !explained.has(importer)) {
						violations.push({ kind: 'browser-field', importer });
					}
				}
			}
			if (violations.length === 0) return;
			const graph: ImporterGraph = {
				importers: (id) => {
					const info = this.getModuleInfo(id);
					return { static: info?.importers ?? [], dynamic: info?.dynamicImporters ?? [] };
				},
				isEntry: (id) => this.getModuleInfo(id)?.isEntry === true,
			};
			this.error(
				nodeInBrowserMessage(
					environment.name,
					violations,
					(id) => importChain(graph, id),
					environment.config.root,
				),
			);
		},
	};
}

/** The dev dependency optimizer's half: a pre-bundled package that reaches a Node built-in fails too. */
function optimizedDepsGuard(environment: string, root: () => string) {
	return {
		name: 'markless:browser-node-guard-deps',
		buildEnd(this: {
			getModuleIds(): IterableIterator<string>;
			getModuleInfo(id: string): {
				readonly importers: readonly string[];
				readonly dynamicImporters: readonly string[];
				readonly isEntry: boolean;
			} | null;
			error(message: string): never;
		}, error?: Error) {
			if (error) return;
			const violations: NodeInBrowserViolation[] = [];
			for (const id of this.getModuleIds()) {
				const specifier = id.startsWith(OPTIMIZER_BROWSER_EXTERNAL)
					? id.slice(OPTIMIZER_BROWSER_EXTERNAL.length)
					: undefined;
				if (specifier === undefined && id !== VITE_BROWSER_EXTERNAL) continue;
				for (const importer of this.getModuleInfo(id)?.importers ?? []) {
					violations.push(
						specifier === undefined
							? { kind: 'browser-field', importer }
							: { kind: 'builtin', importer, specifier },
					);
				}
			}
			if (violations.length === 0) return;
			const graph: ImporterGraph = {
				importers: (id) => {
					const info = this.getModuleInfo(id);
					return { static: info?.importers ?? [], dynamic: info?.dynamicImporters ?? [] };
				},
				isEntry: (id) => this.getModuleInfo(id)?.isEntry === true,
			};
			this.error(
				nodeInBrowserMessage(environment, violations, (id) => importChain(graph, id), root()),
			);
		},
	};
}
