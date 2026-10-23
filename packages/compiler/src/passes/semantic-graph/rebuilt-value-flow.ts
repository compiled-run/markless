import { asNodes, childNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { moduleSemantics, type ModuleSemantics } from './shared-ast.ts';
import {
	ARRAY_READS,
	MUTATING_STATICS,
	READS,
	isRead,
	unwrap,
	valueKind,
	type ValueKind,
} from './rebuilt-local-writes.ts';

// A handler rebuilds each body const it reads, so a change reaching that value through any name or call is lost.
// Fail closed: a value handed to code the compiler cannot read counts as changed.

type Binding = ModuleSemantics['bindings'][number];

export type ImportedSource = { readonly filename: string; readonly source: string };

/** Imported sources by importing file, then by the specifier it wrote; null when there is no source to read. */
export type ImportedModuleSources = Readonly<
	Record<string, Readonly<Record<string, ImportedSource | null>>>
>;

export type RebuiltValueFlowHost = {
	readonly filename: string;
	readonly source: string;
	readonly semantic: ModuleSemantics;
	/** A component-body local a handler rebuilds, with its definition; null for anything the handler does not rebuild. */
	readonly bodyLocal: (
		binding: Binding,
	) => { readonly kind: 'value' | 'function'; readonly init: AnyNode } | null;
	readonly isFrameworkImport: (localName: string) => boolean;
	readonly importedModuleSources: ImportedModuleSources;
	readonly requestSource: (importer: string, specifier: string) => void;
};

export type RebuiltValueChange = {
	/** The body const whose rebuilt value is changed. */
	readonly name: string;
	/** The change, or the call that hands the value to code the compiler cannot see, as written. */
	readonly write: string;
	/** The function the change is written in, when it is not the handler itself. */
	readonly place: string | null;
	/** The code the value is handed to, when the compiler cannot see what it does. */
	readonly callee: string | null;
};

type ModuleContext = {
	readonly filename: string;
	readonly source: string;
	readonly semantic: ModuleSemantics;
	readonly current: boolean;
};

type Shape =
	| { readonly t: 'owned'; readonly origin: string; readonly inits: ReadonlyArray<AnyNode> | null }
	| {
			readonly t: 'fresh';
			readonly id: string;
			readonly of: ValueKind;
			readonly member: (key: string | null) => Shape | null;
	  }
	| { readonly t: 'union'; readonly parts: ReadonlyArray<Shape> };

type Site =
	| { readonly kind: 'call'; readonly args: ReadonlyArray<AnyNode | null>; readonly ctx: ModuleContext }
	| {
			readonly kind: 'callback';
			readonly receiver: AnyNode;
			readonly method: string | null;
			readonly call: AnyNode;
			readonly ctx: ModuleContext;
	  }
	| { readonly kind: 'contents'; readonly of: AnyNode; readonly ctx: ModuleContext };

type Callable =
	| { readonly t: 'function'; readonly fn: AnyNode; readonly ctx: ModuleContext }
	| { readonly t: 'known'; readonly name: string }
	| { readonly t: 'framework' }
	| { readonly t: 'method' }
	| { readonly t: 'opaque'; readonly label: string };

const CALLBACK_METHODS = new Set([
	'every',
	'filter',
	'find',
	'findIndex',
	'findLast',
	'findLastIndex',
	'flatMap',
	'forEach',
	'map',
	'reduce',
	'reduceRight',
	'some',
	'sort',
	'toSorted',
]);
const STORE_METHODS = new Set(['push', 'unshift', 'splice', 'set', 'add', 'fill']);
const KNOWN_CALLS = new Set([
	'String',
	'Number',
	'Boolean',
	'BigInt',
	'Symbol',
	'parseInt',
	'parseFloat',
	'isNaN',
	'isFinite',
	'encodeURIComponent',
	'decodeURIComponent',
	'encodeURI',
	'decodeURI',
	'structuredClone',
	'alert',
	'confirm',
	'prompt',
	'fetch',
	'setTimeout',
	'setInterval',
	'clearTimeout',
	'clearInterval',
	'queueMicrotask',
	'requestAnimationFrame',
	'cancelAnimationFrame',
	'JSON.stringify',
	'JSON.parse',
	'Array.isArray',
	'Array.from',
	'Array.of',
	'Object.keys',
	'Object.values',
	'Object.entries',
	'Object.fromEntries',
	'Object.hasOwn',
	'Object.is',
	'Object.getOwnPropertyNames',
	'Object.getOwnPropertySymbols',
	'Object.getPrototypeOf',
	'Object.isFrozen',
	'Object.isSealed',
	'Object.isExtensible',
	'Object.groupBy',
	'Map.groupBy',
	'Number.isInteger',
	'Number.isFinite',
	'Number.isNaN',
	'Number.isSafeInteger',
	'Number.parseFloat',
	'Number.parseInt',
	'Date.UTC',
	'Date.parse',
	'Date.now',
	'Promise.resolve',
	'Promise.all',
	'Promise.allSettled',
	'Promise.race',
	'Promise.any',
	'Reflect.get',
	'Reflect.has',
	'Reflect.ownKeys',
	'Reflect.getPrototypeOf',
	'String.raw',
	'history.pushState',
	'history.replaceState',
	...MUTATING_STATICS,
]);
const KNOWN_NAMESPACES = new Set(['console', 'Math']);
const KNOWN_CONSTRUCTORS = new Set([
	'Map',
	'Set',
	'WeakMap',
	'WeakSet',
	'Array',
	'Date',
	'URL',
	'URLSearchParams',
	'RegExp',
	'Error',
	'TypeError',
	'RangeError',
	'String',
	'Number',
	'Boolean',
	'Blob',
	'File',
	'FormData',
	'Headers',
	'Request',
	'Response',
	'Promise',
	'Event',
	'CustomEvent',
	'AbortController',
	'TextEncoder',
	'TextDecoder',
	'ArrayBuffer',
	'Int8Array',
	'Uint8Array',
	'Uint8ClampedArray',
	'Int16Array',
	'Uint16Array',
	'Int32Array',
	'Uint32Array',
	'Float32Array',
	'Float64Array',
	'BigInt64Array',
	'BigUint64Array',
]);
const GLOBAL_OBJECTS = new Set(['window', 'globalThis', 'self']);
const MAX_EVALUATIONS = 200_000;
const MAX_ROUNDS = 8;

class FlowExhausted extends Error {}

/** The first change a handler makes to a rebuilt body value, followed through aliases, calls and imports. */
export function findRebuiltValueChange(
	handler: AnyNode,
	host: RebuiltValueFlowHost,
): RebuiltValueChange | null {
	return new RebuiltValueFlow(handler, host).run();
}

class RebuiltValueFlow {
	private readonly current: ModuleContext;
	private readonly reachable = new Map<AnyNode, ModuleContext>();
	private readonly sites = new Map<AnyNode, Site[]>();
	private readonly modules = new Map<string, ModuleContext>();
	private readonly evaluating = new Set<string>();
	private readonly declaringFunctions = new WeakMap<AnyNode, AnyNode | null>();
	private evaluations = 0;
	private lastOrigin: string | null = null;

	private readonly root: AnyNode;
	private readonly host: RebuiltValueFlowHost;

	constructor(root: AnyNode, host: RebuiltValueFlowHost) {
		this.root = root;
		this.host = host;
		this.current = {
			filename: host.filename,
			source: host.source,
			semantic: host.semantic,
			current: true,
		};
	}

	run(): RebuiltValueChange | null {
		this.addReachable(this.root, this.current);
		let finding: RebuiltValueChange | null = null;
		try {
			// A change found stays found as calls are linked; only a clean pass must wait for the links to settle.
			for (let round = 0; round < MAX_ROUNDS && !finding; round++) {
				const known = this.reachable.size;
				const knownSites = this.siteCount();
				finding = this.report();
				if (this.reachable.size === known && this.siteCount() === knownSites) break;
			}
		} catch (error) {
			if (!(error instanceof FlowExhausted)) throw error;
			return this.lastOrigin
				? {
						name: this.lastOrigin,
						write: source(this.root, this.current),
						place: null,
						callee: null,
					}
				: null;
		}
		return finding;
	}

	private siteCount(): number {
		let count = 0;
		for (const list of this.sites.values()) count += list.length;
		return count;
	}

	// Reachability: every function the handler can run, found without reading any import.

	private addReachable(fn: AnyNode, ctx: ModuleContext): void {
		if (this.reachable.has(fn)) return;
		this.reachable.set(fn, ctx);
		this.walkCode(fn, (node) => this.discover(node, ctx), (nested) => this.addReachable(nested, ctx));
	}

	private addSite(fn: AnyNode, ctx: ModuleContext, site: Site): void {
		this.addReachable(fn, ctx);
		const list = this.sites.get(fn) ?? [];
		this.sites.set(fn, list);
		if (!list.some((known) => sameSite(known, site))) list.push(site);
	}

	private discover(node: AnyNode, ctx: ModuleContext): void {
		if (node.type === 'Identifier') {
			const target = this.callable(node, ctx, false);
			if (target.t === 'function') this.addReachable(target.fn, target.ctx);
			// A body const's definition is spliced into the handler, so its code runs there too.
			const value = this.bodyValueDefinition(node, ctx);
			if (value) this.addReachable(value, ctx);
			return;
		}
		if (node.type === 'TaggedTemplateExpression') {
			const target = this.callable(unwrap(node.tag as AnyNode)!, ctx, false);
			if (target.t === 'function')
				this.addSite(target.fn, target.ctx, {
					kind: 'call',
					args: [null, ...asNodes((node.quasi as AnyNode).expressions)],
					ctx,
				});
			return;
		}
		if (node.type !== 'CallExpression' && node.type !== 'NewExpression') return;
		this.linkCall(node, ctx, false);
	}

	// Records which functions a call runs and with what; reading imports only once a rebuilt value is handed over.
	private linkCall(call: AnyNode, ctx: ModuleContext, readImports: boolean): void {
		const callee = unwrap(call.callee as AnyNode)!;
		const args = asNodes(call.arguments);
		const target = this.callable(callee, ctx, readImports);
		if (target.t === 'function') {
			this.addSite(target.fn, target.ctx, { kind: 'call', args, ctx });
			return;
		}
		if (target.t === 'known') {
			if (target.name === 'Array.from' && args[0] && args[1]) {
				const mapper = this.functionValue(args[1], ctx, readImports);
				if (mapper)
					this.addSite(mapper.fn, mapper.ctx, { kind: 'contents', of: args[0], ctx });
			}
			return;
		}
		if (target.t !== 'method' || callee.type !== 'MemberExpression') return;
		for (const arg of args) {
			const fn = this.functionValue(arg, ctx, readImports);
			if (fn)
				this.addSite(fn.fn, fn.ctx, {
					kind: 'callback',
					receiver: callee.object as AnyNode,
					method: memberKey(callee),
					call,
					ctx,
				});
		}
	}

	// Checking: every change the reachable code makes, with the shapes the reachable calls give it.

	private report(): RebuiltValueChange | null {
		for (const [fn, ctx] of this.reachable) {
			let finding: RebuiltValueChange | null = null;
			this.walkCode(
				fn,
				(node) => {
					finding ??= this.check(node, fn, ctx);
				},
				() => {},
			);
			if (finding) return finding;
		}
		return null;
	}

	private check(node: AnyNode, fn: AnyNode, ctx: ModuleContext): RebuiltValueChange | null {
		switch (node.type) {
			case 'AssignmentExpression':
				return this.checkTarget(node.left as AnyNode, node, fn, ctx);
			case 'UpdateExpression':
				return this.checkTarget(node.argument as AnyNode, node, fn, ctx);
			case 'UnaryExpression':
				return node.operator === 'delete'
					? this.checkTarget(node.argument as AnyNode, node, fn, ctx)
					: null;
			case 'ForOfStatement':
			case 'ForInStatement':
				return (node.left as AnyNode).type === 'VariableDeclaration'
					? null
					: this.checkTarget(node.left as AnyNode, node.left as AnyNode, fn, ctx);
			case 'CallExpression':
			case 'NewExpression':
				return this.checkCall(node, fn, ctx);
			case 'TaggedTemplateExpression':
				return this.checkTag(node, fn, ctx);
			default:
				return null;
		}
	}

	private checkTarget(
		target: AnyNode,
		whole: AnyNode,
		fn: AnyNode,
		ctx: ModuleContext,
	): RebuiltValueChange | null {
		const node = unwrap(target);
		if (!node) return null;
		if (node.type === 'MemberExpression') {
			const owned = ownedParts(this.shapeOf(node.object as AnyNode, ctx));
			return owned[0] ? this.finding(owned[0].origin, whole, fn, ctx, null) : null;
		}
		for (const child of patternTargets(node)) {
			const finding = this.checkTarget(child, whole, fn, ctx);
			if (finding) return finding;
		}
		return null;
	}

	private checkCall(call: AnyNode, fn: AnyNode, ctx: ModuleContext): RebuiltValueChange | null {
		const callee = unwrap(call.callee as AnyNode)!;
		const args = asNodes(call.arguments);
		const argShapes = args.map((arg) => this.argumentShape(arg, ctx));
		const handed = argShapes.find((shape) => shape !== null) ?? null;
		if (call.type === 'NewExpression') {
			const name = staticPath(callee, ctx);
			if ((name && KNOWN_CONSTRUCTORS.has(name)) || name?.startsWith('Intl.')) return null;
			if (handed) {
				const target = this.callable(callee, ctx, true);
				if (target.t === 'function') return this.linked(call, ctx);
				return this.finding(origin(handed)!, call, fn, ctx, source(callee, ctx));
			}
			return null;
		}
		const target = this.callable(callee, ctx, handed !== null);
		if (target.t === 'function') return this.linked(call, ctx);
		if (target.t === 'framework') return null;
		if (target.t === 'known') {
			const owned = ownedParts(argShapes[0] ?? null);
			return MUTATING_STATICS.has(target.name) && owned[0]
				? this.finding(owned[0].origin, call, fn, ctx, null)
				: null;
		}
		if (target.t === 'opaque')
			return handed ? this.finding(origin(handed)!, call, fn, ctx, target.label) : null;
		// A method: a change to its receiver unless it only reads, and its callback sees the receiver's contents.
		const method = callee.type === 'MemberExpression' ? memberKey(callee) : null;
		const receiver = this.shapeOf(callee.object as AnyNode, ctx);
		if (receiver) {
			for (const part of ownedParts(receiver))
				if (method === null || !isRead(kindOf(part), method))
					return this.finding(part.origin, call, fn, ctx, null);
			if (method !== null && CALLBACK_METHODS.has(method) && args[0]) {
				const callback = unwrap(args[0])!;
				const target =
					callback.type === 'Identifier' || callback.type === 'MemberExpression'
						? this.callable(callback, ctx, true)
						: null;
				if (isFunction(callback) || target?.t === 'function') {
					this.linkCall(call, ctx, true);
				} else if (target?.t !== 'known' && target?.t !== 'framework') {
					return this.finding(origin(receiver)!, call, fn, ctx, source(args[0], ctx));
				}
			}
			return null;
		}
		if (!handed) return null;
		if (this.isLocalContainer(callee.object as AnyNode, ctx, method)) return null;
		return this.finding(origin(handed)!, call, fn, ctx, source(callee, ctx));
	}

	private checkTag(node: AnyNode, fn: AnyNode, ctx: ModuleContext): RebuiltValueChange | null {
		const handed = asNodes((node.quasi as AnyNode).expressions)
			.map((expression) => this.shapeOf(expression, ctx))
			.find(Boolean);
		if (!handed) return null;
		const tag = unwrap(node.tag as AnyNode)!;
		const target = this.callable(tag, ctx, true);
		if (target.t === 'function') {
			this.addSite(target.fn, target.ctx, {
				kind: 'call',
				args: [null, ...asNodes((node.quasi as AnyNode).expressions)],
				ctx,
			});
			return null;
		}
		if (target.t === 'known' || target.t === 'framework') return null;
		return this.finding(origin(handed)!, node, fn, ctx, source(tag, ctx));
	}

	// A call into code found only now (an import read for this value) joins the reachable set for the next round.
	private linked(call: AnyNode, ctx: ModuleContext): null {
		this.linkCall(call, ctx, true);
		return null;
	}

	// A store into a container the reachable code itself declared is followed through that container's binding.
	private isLocalContainer(receiver: AnyNode, ctx: ModuleContext, method: string | null): boolean {
		const node = unwrap(receiver);
		if (!node || method === null) return false;
		if (valueKind(node) === 'primitive') return true;
		const root = rootIdentifier(node);
		const binding = root ? ctx.semantic.referenceOf(root as never)?.binding : null;
		if (!binding || !this.isAnalysedLocal(binding, ctx)) return false;
		return STORE_METHODS.has(method) || ARRAY_READS.has(method) || READS.map.has(method);
	}

	private finding(
		name: string,
		node: AnyNode,
		fn: AnyNode,
		ctx: ModuleContext,
		callee: string | null,
	): RebuiltValueChange {
		const inRoot =
			ctx === this.current &&
			(fn.start as number) >= (this.root.start as number) &&
			(fn.end as number) <= (this.root.end as number);
		const place = inRoot ? null : functionName(fn, ctx);
		return {
			name,
			write: source(node, ctx),
			place: place && !ctx.current ? `${place}\` in \`${ctx.filename}` : place,
			callee,
		};
	}

	// Shapes: what a value may hold of a rebuilt body const, or null for none.

	private argumentShape(arg: AnyNode, ctx: ModuleContext): Shape | null {
		return arg.type === 'SpreadElement'
			? contents(this.shapeOf(arg.argument as AnyNode, ctx))
			: this.shapeOf(arg, ctx);
	}

	private shapeOf(input: AnyNode | null | undefined, ctx: ModuleContext): Shape | null {
		const node = unwrap(input ?? undefined);
		if (!node) return null;
		if (++this.evaluations > MAX_EVALUATIONS) throw new FlowExhausted();
		switch (node.type) {
			case 'Identifier':
				return this.identifierShape(node, ctx);
			case 'MemberExpression': {
				const object = this.shapeOf(node.object as AnyNode, ctx);
				return object ? member(object, memberKey(node)) : null;
			}
			case 'CallExpression':
				return this.callResult(node, ctx);
			case 'NewExpression':
				return this.constructed(node, ctx);
			case 'ArrayExpression':
				return this.arrayShape(node, ctx);
			case 'ObjectExpression':
				return this.objectShape(node, ctx);
			case 'ConditionalExpression':
				return union([
					this.shapeOf(node.consequent as AnyNode, ctx),
					this.shapeOf(node.alternate as AnyNode, ctx),
				]);
			case 'LogicalExpression':
				return union([
					this.shapeOf(node.left as AnyNode, ctx),
					this.shapeOf(node.right as AnyNode, ctx),
				]);
			case 'SequenceExpression':
				return this.shapeOf(asNodes(node.expressions).at(-1), ctx);
			case 'AssignmentExpression':
				return node.operator === '=' ? this.shapeOf(node.right as AnyNode, ctx) : null;
			case 'AwaitExpression':
				return this.shapeOf(node.argument as AnyNode, ctx);
			default:
				return null;
		}
	}

	private guarded(key: string, compute: () => Shape | null): Shape | null {
		if (this.evaluating.has(key)) return null;
		this.evaluating.add(key);
		try {
			return compute();
		} finally {
			this.evaluating.delete(key);
		}
	}

	private identifierShape(node: AnyNode, ctx: ModuleContext): Shape | null {
		const binding = ctx.semantic.referenceOf(node as never)?.binding;
		if (!binding) return null;
		if (this.isAnalysedLocal(binding, ctx)) return this.bindingShape(binding, ctx);
		const init = this.bodyValueDefinition(node, ctx);
		return init ? this.guarded(`body:${binding.id}`, () => this.bodyValue(binding.name, init)) : null;
	}

	private bodyValueDefinition(node: AnyNode, ctx: ModuleContext): AnyNode | null {
		const binding = ctx.semantic.referenceOf(node as never)?.binding;
		if (!binding || !ctx.current || binding.scope.kind === 'module') return null;
		if (this.isAnalysedLocal(binding, ctx)) return null;
		const local = this.host.bodyLocal(binding);
		return local?.kind === 'value' ? local.init : null;
	}

	private bodyValue(name: string, init: AnyNode): Shape | null {
		const node = unwrap(init);
		if (!node) return null;
		const kind = valueKind(node);
		if (kind === 'primitive' || kind === 'regexp') return null;
		this.lastOrigin ??= name;
		// `const copy = list` or `const items = box.items` rebuilds the value it names, as that value.
		if (node.type === 'Identifier' || node.type === 'MemberExpression') {
			const named = this.shapeOf(node, this.current);
			if (named) return renamed(named, name);
		}
		return { t: 'owned', origin: name, inits: [node] };
	}

	private bindingShape(binding: Binding, ctx: ModuleContext): Shape | null {
		return this.guarded(`${ctx.filename}#${binding.id}`, () => {
			const shapes: Array<Shape | null> = [];
			for (const declaration of binding.declarations)
				shapes.push(this.declaredShape(declaration as AnyNode, ctx));
			for (const reference of binding.references) {
				if (reference.inTypePosition) continue;
				shapes.push(
					reference.isWrite
						? this.declaredShape(reference.node as unknown as AnyNode, ctx)
						: this.storedShape(reference.node as unknown as AnyNode, ctx),
				);
			}
			return union(shapes);
		});
	}

	// The shape a binding gets where it is declared or assigned, through any destructuring pattern around it.
	private declaredShape(name: AnyNode, ctx: ModuleContext): Shape | null {
		const steps: Array<(shape: Shape) => Shape | null> = [];
		const defaults: Array<Shape | null> = [];
		let node = name;
		for (;;) {
			const parent = ctx.semantic.parentOf(node as never) as AnyNode | null;
			if (!parent) return null;
			if (parent.type === 'Property' && parent.value === node) {
				const key = propertyKey(parent);
				steps.unshift((shape) => member(shape, key));
				node = ctx.semantic.parentOf(parent as never) as AnyNode;
				continue;
			}
			if (parent.type === 'ArrayPattern') {
				const index = asNodes(parent.elements).indexOf(node);
				steps.unshift((shape) => member(shape, String(index)));
				node = parent;
				continue;
			}
			if (parent.type === 'RestElement') {
				const id = freshId(parent, ctx, 'rest');
				steps.unshift((shape) => fresh(id, 'array', () => contents(shape)));
				node = parent;
				const pattern = ctx.semantic.parentOf(parent as never) as AnyNode | null;
				if (pattern?.type === 'ArrayPattern' || pattern?.type === 'ObjectPattern') node = pattern;
				continue;
			}
			if (parent.type === 'AssignmentPattern' && parent.left === node) {
				defaults.push(this.shapeOf(parent.right as AnyNode, ctx));
				node = parent;
				continue;
			}
			let base: Shape | null = null;
			if (parent.type === 'VariableDeclarator' && parent.id === node) {
				const declaration = ctx.semantic.parentOf(parent as never) as AnyNode | null;
				const loop = declaration ? (ctx.semantic.parentOf(declaration as never) as AnyNode | null) : null;
				if (loop?.type === 'ForOfStatement' && loop.left === declaration)
					base = contents(this.shapeOf(loop.right as AnyNode, ctx));
				else if (loop?.type === 'ForInStatement' && loop.left === declaration) base = null;
				else base = this.shapeOf(parent.init as AnyNode | undefined, ctx);
			} else if (parent.type === 'AssignmentExpression' && parent.left === node) {
				base = parent.operator === '=' ? this.shapeOf(parent.right as AnyNode, ctx) : null;
			} else if (parent.type === 'ForOfStatement' && parent.left === node) {
				base = contents(this.shapeOf(parent.right as AnyNode, ctx));
			} else if (isFunction(parent) && asNodes(parent.params).includes(node)) {
				base = this.parameterShape(parent, asNodes(parent.params).indexOf(node), node);
			}
			let shape = base;
			for (const step of steps) shape = shape ? step(shape) : null;
			return union([shape, ...defaults]);
		}
	}

	// `list.push(value)`, `box.key = value` or `Object.assign(box, value)` on a local container: it now holds value.
	private storedShape(reference: AnyNode, ctx: ModuleContext): Shape | null {
		const keys: Array<string | null> = [];
		let node = reference;
		let parent = ctx.semantic.parentOf(node as never) as AnyNode | null;
		while (parent && (isWrapper(parent) || (parent.type === 'MemberExpression' && parent.object === node))) {
			if (parent.type === 'MemberExpression') keys.push(memberKey(parent));
			node = parent;
			parent = ctx.semantic.parentOf(node as never) as AnyNode | null;
		}
		if (!parent) return null;
		const id = freshId(parent, ctx, 'store');
		if (keys.length === 0) {
			const args = asNodes(parent.arguments);
			if (
				parent.type === 'CallExpression' &&
				args[0] === node &&
				staticPath(unwrap(parent.callee as AnyNode)!, ctx) === 'Object.assign'
			) {
				const sources = args.slice(1).map((arg) => this.argumentShape(arg, ctx));
				return sources.some(Boolean)
					? fresh(id, 'object', (key) => union(sources.map((shape) => (shape ? member(shape, key) : null))))
					: null;
			}
			return null;
		}
		let stored: Shape | null = null;
		let depth = keys.length;
		if (parent.type === 'AssignmentExpression' && parent.left === node && parent.operator === '=') {
			stored = this.shapeOf(parent.right as AnyNode, ctx);
		} else if (parent.type === 'CallExpression' && parent.callee === node) {
			const method = keys.at(-1) ?? null;
			if (method === null || !STORE_METHODS.has(method)) return null;
			const args = asNodes(parent.arguments);
			const values = method === 'splice' ? args.slice(2) : method === 'fill' ? args.slice(0, 1) : args;
			const shapes = values.map((arg) => this.argumentShape(arg, ctx));
			if (!shapes.some(Boolean)) return null;
			stored = fresh(`${id}:held`, 'unknown', () => union(shapes));
			depth -= 1;
		}
		if (!stored) return null;
		let shape: Shape = stored;
		for (let index = depth - 1; index >= 0; index--) {
			const key = keys[index] ?? null;
			const inner = shape;
			shape = fresh(`${id}:${index}`, 'unknown', (asked) =>
				key === null || asked === null || asked === key ? inner : null,
			);
		}
		return shape;
	}

	private parameterShape(fn: AnyNode, index: number, parameter: AnyNode): Shape | null {
		const shapes: Array<Shape | null> = [];
		for (const site of this.sites.get(fn) ?? []) {
			if (site.kind === 'call') {
				if (parameter.type === 'RestElement') {
					const rest = site.args.slice(index).map((arg) => (arg ? this.argumentShape(arg, site.ctx) : null));
					shapes.push(rest.some(Boolean) ? fresh(freshId(parameter, site.ctx, 'rest'), 'array', () => union(rest)) : null);
					continue;
				}
				const spread = site.args.findIndex((arg) => arg?.type === 'SpreadElement');
				if (spread !== -1 && spread <= index) {
					for (const arg of site.args.slice(spread))
						shapes.push(arg ? this.argumentShape(arg, site.ctx) : null);
				} else {
					const arg = site.args[index];
					shapes.push(arg ? this.shapeOf(arg, site.ctx) : null);
				}
			} else if (site.kind === 'callback') {
				const receiver = this.shapeOf(site.receiver, site.ctx);
				if (receiver)
					shapes.push(this.callbackParameters(receiver, site.method, site.call, site.ctx)[index] ?? null);
			} else if (index === 0) {
				shapes.push(contents(this.shapeOf(site.of, site.ctx)));
			}
		}
		return union(shapes);
	}

	private callbackParameters(
		receiver: Shape,
		method: string | null,
		call: AnyNode,
		ctx: ModuleContext,
	): Array<Shape | null> {
		const items = contents(receiver);
		const kind = kindOf(receiver);
		if (kind === 'array') {
			if (method === 'reduce' || method === 'reduceRight')
				return [union([items, this.shapeOf(asNodes(call.arguments)[1], ctx)]), items, null, receiver];
			if (method === 'sort' || method === 'toSorted') return [items, items];
			return [items, null, receiver];
		}
		return [items, items, receiver];
	}

	private callResult(call: AnyNode, ctx: ModuleContext): Shape | null {
		const callee = unwrap(call.callee as AnyNode)!;
		const args = asNodes(call.arguments);
		const handed = args.some((arg) => this.argumentShape(arg, ctx) !== null);
		const target = this.callable(callee, ctx, handed);
		if (target.t === 'function') {
			if (handed) this.linkCall(call, ctx, true);
			return this.returnShape(target.fn, target.ctx);
		}
		if (target.t === 'known') return this.knownResult(target.name, args, ctx);
		if (target.t !== 'method' || callee.type !== 'MemberExpression') return null;
		const receiver = this.shapeOf(callee.object as AnyNode, ctx);
		return receiver ? this.methodResult(receiver, memberKey(callee), call, ctx) : null;
	}

	private returnShape(fn: AnyNode, ctx: ModuleContext): Shape | null {
		return this.guarded(`return:${ctx.filename}:${fn.start}`, () => {
			const body = fn.body as AnyNode | undefined;
			if (body && body.type !== 'BlockStatement') return this.shapeOf(body, ctx);
			const shapes: Array<Shape | null> = [];
			this.walkCode(
				fn,
				(node) => {
					if (node.type === 'ReturnStatement')
						shapes.push(this.shapeOf(node.argument as AnyNode | undefined, ctx));
				},
				() => {},
			);
			return union(shapes);
		});
	}

	private methodResult(
		receiver: Shape,
		method: string | null,
		call: AnyNode,
		ctx: ModuleContext,
	): Shape | null {
		const args = asNodes(call.arguments);
		const items = contents(receiver);
		const id = freshId(call, ctx, 'result');
		const returned = () =>
			union(
				args.slice(0, 1).map((arg) => {
					const fn = this.functionValue(arg, ctx, false);
					return fn ? this.returnShape(fn.fn, fn.ctx) : null;
				}),
			);
		switch (kindOf(receiver)) {
			case 'array':
				switch (method) {
					case 'at':
					case 'find':
					case 'findLast':
					case 'pop':
					case 'shift':
						return items;
					case 'filter':
					case 'slice':
					case 'toSorted':
					case 'toReversed':
					case 'splice':
					case 'values':
						return items && fresh(id, 'array', () => items);
					case 'flat':
						return items && fresh(id, 'array', () => union([items, contents(items)]));
					case 'concat':
					case 'with':
					case 'toSpliced': {
						const added = args.map((arg) => this.argumentShape(arg, ctx));
						const all = union([items, ...added, ...added.map(contents)]);
						return all && fresh(id, 'array', () => all);
					}
					case 'map':
					case 'flatMap': {
						const mapped = returned();
						const all = method === 'flatMap' ? union([mapped, contents(mapped)]) : mapped;
						return all && fresh(id, 'array', () => all);
					}
					case 'reduce':
					case 'reduceRight':
						return union([items, this.shapeOf(args[1], ctx), returned()]);
					case 'entries':
						return items && fresh(id, 'array', () => fresh(`${id}:entry`, 'array', () => items));
					case 'sort':
					case 'reverse':
					case 'fill':
					case 'copyWithin':
						return receiver;
					default:
						return null;
				}
			case 'map':
			case 'weak-map':
				if (method === 'get') return items;
				if (method === 'values' || method === 'entries')
					return items && fresh(id, 'array', () => items);
				return method === 'set' ? receiver : null;
			case 'set':
				if (method === 'add') return receiver;
				if (
					method === 'union' ||
					method === 'intersection' ||
					method === 'difference' ||
					method === 'symmetricDifference'
				) {
					const all = union([items, contents(this.argumentShape(args[0] ?? ({} as AnyNode), ctx))]);
					return all && fresh(id, 'set', () => all);
				}
				if (method === 'values' || method === 'keys' || method === 'entries')
					return items && fresh(id, 'array', () => items);
				return null;
			case 'object':
				return method === 'valueOf' ? receiver : null;
			case 'unknown':
				return union([items, receiver]);
			default:
				return null;
		}
	}

	private knownResult(name: string, args: ReadonlyArray<AnyNode>, ctx: ModuleContext): Shape | null {
		const first = () => (args[0] ? this.argumentShape(args[0], ctx) : null);
		const id = `${ctx.filename}:${args[0]?.start ?? 0}:${name}`;
		const wrap = (of: ValueKind, inner: Shape | null) => inner && fresh(id, of, () => inner);
		switch (name) {
			case 'Array.from': {
				const mapper = args[1] ? this.functionValue(args[1], ctx, false) : null;
				return wrap('array', mapper ? this.returnShape(mapper.fn, mapper.ctx) : contents(first()));
			}
			case 'Array.of':
				return wrap('array', union(args.map((arg) => this.argumentShape(arg, ctx))));
			case 'Object.values':
				return wrap('array', contents(first()));
			case 'Object.entries':
				return wrap('array', wrap('array', contents(first())));
			case 'Object.fromEntries':
				return wrap('object', contents(contents(first())));
			case 'Object.groupBy':
				return wrap('object', wrap('array', contents(first())));
			case 'Map.groupBy':
				return wrap('map', wrap('array', contents(first())));
			case 'Promise.all':
			case 'Promise.allSettled':
				return wrap('array', contents(first()));
			case 'Promise.race':
			case 'Promise.any':
				return contents(first());
			case 'Reflect.get': {
				const object = first();
				return object ? member(object, null) : null;
			}
			case 'Promise.resolve':
			case 'Object.assign':
			case 'Object.freeze':
			case 'Object.seal':
			case 'Object.preventExtensions':
			case 'Object.defineProperty':
			case 'Object.defineProperties':
			case 'Object.setPrototypeOf':
				return first();
			default:
				return null;
		}
	}

	private constructed(node: AnyNode, ctx: ModuleContext): Shape | null {
		const name = staticPath(unwrap(node.callee as AnyNode)!, ctx);
		const args = asNodes(node.arguments);
		const first = args[0] ? this.argumentShape(args[0], ctx) : null;
		const id = freshId(node, ctx, 'new');
		switch (name) {
			case 'Map':
			case 'WeakMap': {
				const entries = contents(contents(first));
				return entries && fresh(id, name === 'Map' ? 'map' : 'weak-map', () => entries);
			}
			case 'Set':
			case 'WeakSet': {
				const items = contents(first);
				return items && fresh(id, name === 'Set' ? 'set' : 'weak-set', () => items);
			}
			case 'Array': {
				const items = union(args.map((arg) => this.argumentShape(arg, ctx)));
				return items && fresh(id, 'array', () => items);
			}
			default:
				return null;
		}
	}

	private arrayShape(node: AnyNode, ctx: ModuleContext): Shape | null {
		const elements = asNodes(node.elements);
		const shapes = elements.map((element) => this.argumentShape(element, ctx));
		if (!shapes.some(Boolean)) return null;
		const spread = elements.some((element) => element.type === 'SpreadElement');
		return fresh(freshId(node, ctx, 'array'), 'array', (key) => {
			if (key === 'length') return null;
			if (key !== null && /^\d+$/.test(key) && !spread) return shapes[Number(key)] ?? null;
			return union(shapes);
		});
	}

	private objectShape(node: AnyNode, ctx: ModuleContext): Shape | null {
		const entries: Array<{ readonly key: string | null; readonly shape: Shape | null; readonly spread: boolean }> = [];
		for (const property of asNodes(node.properties)) {
			if (property.type === 'SpreadElement') {
				entries.push({ key: null, shape: this.shapeOf(property.argument as AnyNode, ctx), spread: true });
			} else if (property.type === 'Property' && property.kind === 'init' && property.method !== true) {
				entries.push({
					key: propertyKey(property),
					shape: this.shapeOf(property.value as AnyNode, ctx),
					spread: false,
				});
			}
		}
		if (!entries.some((entry) => entry.shape)) return null;
		return fresh(freshId(node, ctx, 'object'), 'object', (key) =>
			union(
				entries.map((entry) => {
					if (!entry.shape) return null;
					if (entry.spread) return member(entry.shape, key);
					return key === null || entry.key === null || entry.key === key ? entry.shape : null;
				}),
			),
		);
	}

	// Callees.

	private callable(callee: AnyNode, ctx: ModuleContext, readImports: boolean): Callable {
		if (isFunction(callee)) return { t: 'function', fn: callee, ctx };
		if (callee.type === 'Identifier') {
			const name = getIdentifierName(callee) ?? '';
			const binding = ctx.semantic.referenceOf(callee as never)?.binding;
			if (!binding) return KNOWN_CALLS.has(name) ? { t: 'known', name } : { t: 'opaque', label: name };
			return this.bindingCallable(binding, ctx, readImports, 0);
		}
		if (callee.type === 'MemberExpression') {
			const path = staticPath(callee, ctx);
			if (path !== null) {
				const head = path.split('.')[0]!;
				return KNOWN_CALLS.has(path) || KNOWN_NAMESPACES.has(head)
					? { t: 'known', name: path }
					: { t: 'opaque', label: source(callee, ctx) };
			}
			const object = unwrap(callee.object as AnyNode);
			const binding =
				object?.type === 'Identifier' ? ctx.semantic.referenceOf(object as never)?.binding : null;
			const namespace = binding
				? ctx.semantic.imports.find((record) => record.local?.id === binding.id && record.isNamespace)
				: undefined;
			const name = memberKey(callee);
			if (namespace && name !== null) {
				if (ctx.current && this.host.isFrameworkImport(getIdentifierName(object) ?? ''))
					return { t: 'framework' };
				return readImports
					? this.importedCallable(ctx, namespace.specifier, name, source(callee, ctx), 0)
					: { t: 'opaque', label: source(callee, ctx) };
			}
			return { t: 'method' };
		}
		return { t: 'opaque', label: source(callee, ctx) };
	}

	private functionValue(
		node: AnyNode,
		ctx: ModuleContext,
		readImports: boolean,
	): { readonly fn: AnyNode; readonly ctx: ModuleContext } | null {
		const value = unwrap(node);
		if (!value) return null;
		if (isFunction(value)) return { fn: value, ctx };
		if (value.type !== 'Identifier' && value.type !== 'MemberExpression') return null;
		const target = this.callable(value, ctx, readImports);
		return target.t === 'function' ? target : null;
	}

	private bindingCallable(
		binding: Binding,
		ctx: ModuleContext,
		readImports: boolean,
		depth: number,
	): Callable {
		const name = binding.name;
		if (depth > 8) return { t: 'opaque', label: name };
		if (!this.isAnalysedLocal(binding, ctx) && ctx.current && binding.scope.kind !== 'module') {
			const local = this.host.bodyLocal(binding);
			return local?.kind === 'function'
				? { t: 'function', fn: local.init, ctx }
				: { t: 'opaque', label: name };
		}
		const imported = ctx.semantic.imports.find((record) => record.local?.id === binding.id);
		if (imported) {
			if (ctx.current && this.host.isFrameworkImport(name)) return { t: 'framework' };
			if (imported.typeOnly || imported.isNamespace || !readImports) return { t: 'opaque', label: name };
			return this.importedCallable(ctx, imported.specifier, imported.name ?? 'default', name, depth + 1);
		}
		const declaration = binding.declarations[0] as AnyNode | undefined;
		const parent = declaration ? (ctx.semantic.parentOf(declaration as never) as AnyNode | null) : null;
		if (parent?.type === 'FunctionDeclaration' && parent.id === declaration)
			return { t: 'function', fn: parent, ctx };
		if (parent?.type === 'VariableDeclarator' && parent.id === declaration) {
			const kind = (ctx.semantic.parentOf(parent as never) as AnyNode | null)?.kind;
			const init = unwrap(parent.init as AnyNode | undefined);
			if (kind === 'const' && init && isFunction(init)) return { t: 'function', fn: init, ctx };
			if (kind === 'const' && init?.type === 'Identifier') {
				const next = ctx.semantic.referenceOf(init as never)?.binding;
				if (next) return this.bindingCallable(next, ctx, readImports, depth + 1);
			}
		}
		return { t: 'opaque', label: name };
	}

	private importedCallable(
		ctx: ModuleContext,
		specifier: string,
		exportName: string,
		label: string,
		depth: number,
	): Callable {
		if (depth > 8) return { t: 'opaque', label };
		const entry = this.host.importedModuleSources[ctx.filename]?.[specifier];
		if (entry === undefined) {
			this.host.requestSource(ctx.filename, specifier);
			return { t: 'opaque', label };
		}
		if (entry === null) return { t: 'opaque', label };
		const imported = this.moduleFor(entry);
		if (!imported) return { t: 'opaque', label };
		const stars: string[] = [];
		for (const record of imported.semantic.exports) {
			if (record.name === null && record.specifier) stars.push(record.specifier);
			if (record.name !== exportName) continue;
			if (record.specifier)
				return this.importedCallable(imported, record.specifier, record.fromName ?? exportName, label, depth + 1);
			if (record.local) return this.bindingCallable(record.local, imported, true, depth + 1);
			const node = record.node as AnyNode;
			const declared = isFunction(node) ? node : (node.declaration as AnyNode | undefined);
			return declared && isFunction(declared)
				? { t: 'function', fn: declared, ctx: imported }
				: { t: 'opaque', label };
		}
		for (const star of stars) {
			const found = this.importedCallable(imported, star, exportName, label, depth + 1);
			if (found.t === 'function') return found;
		}
		return { t: 'opaque', label };
	}

	private moduleFor(entry: ImportedSource): ModuleContext | null {
		const known = this.modules.get(entry.filename);
		if (known?.source === entry.source) return known;
		let semantic: ModuleSemantics;
		try {
			semantic = moduleSemantics(entry.source, entry.filename);
		} catch {
			return null;
		}
		const context = { filename: entry.filename, source: entry.source, semantic, current: false };
		this.modules.set(entry.filename, context);
		return context;
	}

	// A binding declared inside code the analysis follows, as opposed to a body const or a module binding.
	private isAnalysedLocal(binding: Binding, ctx: ModuleContext): boolean {
		const declaration = binding.declarations[0] as AnyNode | undefined;
		if (!declaration) return false;
		let fn = this.declaringFunction(declaration, ctx);
		while (fn) {
			if (this.reachable.get(fn) === ctx) return true;
			if (fn === this.root) return true;
			fn = this.declaringFunction(fn, ctx);
		}
		return false;
	}

	private declaringFunction(node: AnyNode, ctx: ModuleContext): AnyNode | null {
		if (this.declaringFunctions.has(node)) return this.declaringFunctions.get(node)!;
		let child = node;
		let parent = ctx.semantic.parentOf(node as never) as AnyNode | null;
		while (parent && !(isFunction(parent) && parent.id !== child)) {
			child = parent;
			parent = ctx.semantic.parentOf(parent as never) as AnyNode | null;
		}
		this.declaringFunctions.set(node, parent);
		return parent;
	}

	// Walks a function's own code, or the handler expression, handing each nested function to `nested`.
	private walkCode(fn: AnyNode, visit: (node: AnyNode) => void, nested: (fn: AnyNode) => void): void {
		const walk = (node: AnyNode): void => {
			visit(node);
			for (const child of childNodes(node)) {
				if (isFunction(child)) nested(child);
				else walk(child);
			}
		};
		if (!isFunction(fn)) {
			walk(fn);
			return;
		}
		for (const parameter of asNodes(fn.params)) walk(parameter);
		if (fn.body) walk(fn.body as AnyNode);
	}
}

function union(shapes: ReadonlyArray<Shape | null>): Shape | null {
	const parts: Shape[] = [];
	const seen = new Set<string>();
	const add = (shape: Shape | null) => {
		if (!shape) return;
		if (shape.t === 'union') {
			for (const part of shape.parts) add(part);
			return;
		}
		const key = shapeKey(shape);
		if (seen.has(key)) return;
		seen.add(key);
		parts.push(shape);
	};
	for (const shape of shapes) add(shape);
	if (parts.length === 0) return null;
	return parts.length === 1 ? parts[0]! : { t: 'union', parts };
}

function shapeKey(shape: Shape): string {
	if (shape.t === 'owned')
		return `owned:${shape.origin}:${shape.inits?.map((init) => init.start).join(',') ?? '?'}`;
	if (shape.t === 'fresh') return `fresh:${shape.id}`;
	return shape.parts.map(shapeKey).join('|');
}

function fresh(id: string, of: ValueKind, read: (key: string | null) => Shape | null): Shape {
	const reading = new Set<string | null>();
	return {
		t: 'fresh',
		id,
		of,
		member: (key) => {
			if (reading.has(key)) return null;
			reading.add(key);
			try {
				return read(key);
			} finally {
				reading.delete(key);
			}
		},
	};
}

function freshId(node: AnyNode, ctx: ModuleContext, label: string): string {
	return `${ctx.filename}:${node.start}:${label}`;
}

function ownedParts(shape: Shape | null): Array<Extract<Shape, { t: 'owned' }>> {
	if (!shape) return [];
	if (shape.t === 'owned') return [shape];
	if (shape.t === 'union') return shape.parts.flatMap(ownedParts);
	return [];
}

function origin(shape: Shape | null, depth = 4): string | null {
	if (!shape || depth === 0) return null;
	if (shape.t === 'owned') return shape.origin;
	if (shape.t === 'union') {
		for (const part of shape.parts) {
			const found = origin(part, depth);
			if (found) return found;
		}
		return null;
	}
	return origin(shape.member(null), depth - 1);
}

function renamed(shape: Shape, name: string): Shape {
	if (shape.t === 'owned') return { ...shape, origin: name };
	if (shape.t === 'union') return { t: 'union', parts: shape.parts.map((part) => renamed(part, name)) };
	return shape;
}

function kindOf(shape: Shape): ValueKind {
	if (shape.t === 'fresh') return shape.of;
	const kinds = new Set(
		shape.t === 'union'
			? shape.parts.map(kindOf)
			: shape.inits === null
				? ['unknown' as const]
				: shape.inits.map(valueKind),
	);
	return kinds.size === 1 ? [...kinds][0]! : 'unknown';
}

function member(shape: Shape, key: string | null): Shape | null {
	if (shape.t === 'fresh') return shape.member(key);
	if (shape.t === 'union') return union(shape.parts.map((part) => member(part, key)));
	if (shape.inits === null) return shape;
	const children: AnyNode[] = [];
	for (const init of shape.inits) {
		const found = childrenAt(init, key);
		if (found === null) return { t: 'owned', origin: shape.origin, inits: null };
		children.push(...found);
	}
	return ownedOf(shape.origin, children);
}

// What `shape` holds as its items: array elements, Map keys and values, Set members, object values.
function contents(shape: Shape | null): Shape | null {
	if (!shape) return null;
	if (shape.t === 'fresh') return shape.member(null);
	if (shape.t === 'union') return union(shape.parts.map(contents));
	if (shape.inits === null) return shape;
	const children: AnyNode[] = [];
	for (const init of shape.inits) {
		const node = unwrap(init)!;
		if (node.type === 'NewExpression') {
			const arg = unwrap(asNodes(node.arguments)[0]);
			const kind = valueKind(node);
			if (!arg) continue;
			if (arg.type !== 'ArrayExpression') return { ...shape, inits: null };
			const items = childrenAt(arg, null);
			if (items === null) return { ...shape, inits: null };
			if (kind === 'map' || kind === 'weak-map') {
				for (const pair of items) {
					const entry = childrenAt(pair, null);
					if (entry === null) return { ...shape, inits: null };
					children.push(...entry);
				}
			} else {
				children.push(...items);
			}
			continue;
		}
		const items = childrenAt(node, null);
		if (items === null) return { ...shape, inits: null };
		children.push(...items);
	}
	return ownedOf(shape.origin, children);
}

function ownedOf(name: string, nodes: ReadonlyArray<AnyNode>): Shape | null {
	const held = nodes.filter((node) => {
		const kind = valueKind(node);
		return kind !== 'primitive' && kind !== 'regexp';
	});
	return held.length > 0 ? { t: 'owned', origin: name, inits: held } : null;
}

// The values a literal shows at `key` (every value for null); null when the literal does not show them.
function childrenAt(init: AnyNode, key: string | null): AnyNode[] | null {
	const node = unwrap(init);
	if (!node) return null;
	const kind = valueKind(node);
	if (kind === 'primitive' || kind === 'regexp') return [];
	if (node.type === 'ObjectExpression') {
		const properties = asNodes(node.properties);
		if (properties.some((property) => property.type !== 'Property' || property.computed === true))
			return null;
		const values = properties
			.filter((property) => key === null || propertyKey(property) === key)
			.map((property) => property.value as AnyNode);
		return key === null ? values : values.slice(-1);
	}
	if (node.type === 'ArrayExpression') {
		if (key === 'length') return [];
		const elements = node.elements as Array<AnyNode | null>;
		if (elements.some((element) => element?.type === 'SpreadElement')) return null;
		if (key === null) return elements.filter((element): element is AnyNode => element !== null);
		if (/^\d+$/.test(key)) {
			const element = elements[Number(key)];
			return element ? [element] : [];
		}
		return [];
	}
	if (key === 'size' || key === 'length') return [];
	return null;
}

function memberKey(node: AnyNode): string | null {
	const property = node.property as AnyNode;
	if (node.computed !== true) return getIdentifierName(property);
	const value = unwrap(property);
	return value?.type === 'Literal' && (typeof value.value === 'string' || typeof value.value === 'number')
		? String(value.value)
		: null;
}

function propertyKey(property: AnyNode): string | null {
	const key = property.key as AnyNode;
	if (property.computed === true) {
		return key.type === 'Literal' && (typeof key.value === 'string' || typeof key.value === 'number')
			? String(key.value)
			: null;
	}
	return getIdentifierName(key) ?? (key.value === undefined ? null : String(key.value));
}

// `JSON.stringify` or `console.log` for a member chain rooted at a global name, null otherwise.
function staticPath(node: AnyNode, ctx: ModuleContext): string | null {
	const names: string[] = [];
	let current: AnyNode | undefined = unwrap(node);
	while (current?.type === 'MemberExpression') {
		const key = current.computed === true ? null : getIdentifierName(current.property as AnyNode);
		if (key === null) return null;
		names.unshift(key);
		current = unwrap(current.object as AnyNode);
	}
	if (current?.type !== 'Identifier') return null;
	if (ctx.semantic.referenceOf(current as never)?.binding) return null;
	names.unshift(getIdentifierName(current)!);
	while (names.length > 1 && GLOBAL_OBJECTS.has(names[0]!)) names.shift();
	return names.join('.');
}

function rootIdentifier(node: AnyNode): AnyNode | null {
	let current: AnyNode | undefined = unwrap(node);
	while (current?.type === 'MemberExpression') current = unwrap(current.object as AnyNode);
	return current?.type === 'Identifier' ? current : null;
}

function patternTargets(node: AnyNode): AnyNode[] {
	if (node.type === 'ObjectPattern')
		return asNodes(node.properties).map((property) =>
			property.type === 'RestElement' ? (property.argument as AnyNode) : (property.value as AnyNode),
		);
	if (node.type === 'ArrayPattern') return asNodes(node.elements);
	if (node.type === 'RestElement') return [node.argument as AnyNode];
	if (node.type === 'AssignmentPattern') return [node.left as AnyNode];
	return [];
}

function isFunction(node: AnyNode | null | undefined): boolean {
	return (
		node?.type === 'FunctionDeclaration' ||
		node?.type === 'FunctionExpression' ||
		node?.type === 'ArrowFunctionExpression'
	);
}

function isWrapper(node: AnyNode): boolean {
	return unwrap(node) !== node;
}

// The nearest name a reader can find the code by: its function's, its variable's, or an enclosing one's.
function functionName(fn: AnyNode, ctx: ModuleContext): string | null {
	for (let node: AnyNode | null = fn; node; node = ctx.semantic.parentOf(node as never) as AnyNode | null) {
		const parent = ctx.semantic.parentOf(node as never) as AnyNode | null;
		if (parent?.type === 'VariableDeclarator' && parent.init === node)
			return getIdentifierName(parent.id as AnyNode);
		if (!isFunction(node)) continue;
		const own = getIdentifierName(node.id as AnyNode | undefined);
		if (own) return own;
		if (parent?.type === 'Property' || parent?.type === 'MethodDefinition') return propertyKey(parent);
	}
	return null;
}

function source(node: AnyNode, ctx: ModuleContext): string {
	return ctx.source.slice(node.start as number, node.end as number);
}

function sameSite(left: Site, right: Site): boolean {
	if (left.kind !== right.kind || left.ctx !== right.ctx) return false;
	if (left.kind === 'call' && right.kind === 'call')
		return left.args.length === right.args.length && left.args.every((arg, index) => arg === right.args[index]);
	if (left.kind === 'callback' && right.kind === 'callback') return left.call === right.call;
	return left.kind === 'contents' && right.kind === 'contents' && left.of === right.of;
}
