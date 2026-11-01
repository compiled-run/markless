import type { AnyNode } from '../../ast/nodes.ts';
import type {
	FunctionParameterWrites,
	ModuleFunctionWrites,
	ParameterWrite,
} from '../../artifacts.ts';
import { isMutatingCollectionMethod } from './collect-expressions.ts';
import { moduleSemantics, type ModuleSemantics } from './shared-ast.ts';
import {
	COPYING_METHODS,
	ELEMENT_CALLBACK_METHODS,
	ELEMENT_RETURNING_METHODS,
} from './write-through-locals.ts';

type Binding = ModuleSemantics['bindings'][number];
type Path = ReadonlyArray<string>;

const WHOLE_ASSUMED: ReadonlyArray<ParameterWrite> = [{ path: [], assumed: true }];

// Methods that read their receiver and never change it.
const READING_METHODS = new Set([
	...ELEMENT_CALLBACK_METHODS,
	...COPYING_METHODS,
	...ELEMENT_RETURNING_METHODS,
	'charAt',
	'charCodeAt',
	'codePointAt',
	'endsWith',
	'entries',
	'get',
	'getTime',
	'has',
	'includes',
	'indexOf',
	'join',
	'keys',
	'lastIndexOf',
	'localeCompare',
	'match',
	'matchAll',
	'normalize',
	'padEnd',
	'padStart',
	'reduce',
	'reduceRight',
	'repeat',
	'replace',
	'replaceAll',
	'search',
	'split',
	'startsWith',
	'substring',
	'toFixed',
	'toISOString',
	'toJSON',
	'toLocaleLowerCase',
	'toLocaleString',
	'toLocaleUpperCase',
	'toLowerCase',
	'toPrecision',
	'toString',
	'toUpperCase',
	'trim',
	'trimEnd',
	'trimStart',
	'valueOf',
	'values',
]);

// Reading methods whose result can hold the receiver's own elements.
const ELEMENT_RESULT_METHODS = new Set([
	...ELEMENT_RETURNING_METHODS,
	...COPYING_METHODS,
	'entries',
	'flatMap',
	'get',
	'map',
	'reduce',
	'reduceRight',
	'values',
]);

// Platform functions that only read the values they are handed.
const READING_GLOBAL_CALLS = new Set([
	'Array.isArray',
	'Boolean',
	'JSON.stringify',
	'Number',
	'Object.entries',
	'Object.keys',
	'Object.values',
	'String',
	'console.log',
	'console.warn',
	'console.error',
	'console.info',
	'console.debug',
]);

const VALUE_WRAPPERS = new Set([
	'ParenthesizedExpression',
	'TSNonNullExpression',
	'TSAsExpression',
	'TSSatisfiesExpression',
	'TSTypeAssertion',
	'ChainExpression',
]);

const READING_PARENTS = new Set([
	'BinaryExpression',
	'ExpressionStatement',
	'IfStatement',
	'SwitchStatement',
	'SwitchCase',
	'WhileStatement',
	'DoWhileStatement',
	'ForStatement',
	'ForInStatement',
	'ReturnStatement',
	'ThrowStatement',
	'TemplateLiteral',
	'ArrowFunctionExpression',
]);

export function isReadingGlobalCallName(name: string): boolean {
	return READING_GLOBAL_CALLS.has(name);
}

/** The write facts of every function a plain module exports, read from its source alone. */
export function analyzeModuleFunctionWrites(input: {
	readonly filename: string;
	readonly source: string;
}): ModuleFunctionWrites {
	let module: ModuleSemantics;
	try {
		module = moduleSemantics(input.source, input.filename);
	} catch {
		return {};
	}
	if (module.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) return {};
	const writes: Record<string, FunctionParameterWrites> = {};
	const analysis = new FunctionWritesAnalysis(module);
	for (const exported of module.exports) {
		if (exported.kind !== 'named' || exported.typeOnly || !exported.name || !exported.local)
			continue;
		const facts = analysis.ofBinding(exported.local);
		if (facts) writes[exported.name] = facts;
	}
	return writes;
}

/** Write facts for functions declared in one analyzed module, memoized per function. */
export class FunctionWritesAnalysis {
	readonly #module: ModuleSemantics;
	readonly #memo = new Map<object, FunctionParameterWrites>();
	readonly #visiting = new Set<object>();

	constructor(module: ModuleSemantics) {
		this.#module = module;
	}

	/** Facts for a binding that names a function declared once and never reassigned; `null` otherwise. */
	ofBinding(binding: Binding): FunctionParameterWrites | null {
		const fn = functionOfBinding(binding, this.#module);
		return fn ? this.ofFunction(fn) : null;
	}

	ofFunction(fn: AnyNode): FunctionParameterWrites {
		const known = this.#memo.get(fn);
		if (known) return known;
		if (this.#visiting.has(fn)) return { parameters: [], rest: WHOLE_ASSUMED };
		this.#visiting.add(fn);
		try {
			const facts = this.#analyze(fn);
			this.#memo.set(fn, facts);
			return facts;
		} finally {
			this.#visiting.delete(fn);
		}
	}

	#analyze(fn: AnyNode): FunctionParameterWrites {
		const params = (fn.params as AnyNode[] | undefined) ?? [];
		if (usesArguments(fn, this.#module)) {
			return { parameters: params.map(() => WHOLE_ASSUMED), rest: WHOLE_ASSUMED };
		}
		const parameters: ParameterWrite[][] = [];
		let rest: ParameterWrite[] | undefined;
		for (const param of params) {
			const out = new WriteSet();
			if (param.type === 'RestElement') {
				for (const binding of patternBindings(param.argument as AnyNode, this.#module))
					this.#track(binding, [], false, out, new Set());
				rest = out.list().length > 0 ? [...WHOLE_ASSUMED] : [];
				continue;
			}
			const target = param.type === 'AssignmentPattern' ? (param.left as AnyNode) : param;
			if (isPrimitiveType(target.typeAnnotation as AnyNode | undefined)) {
				parameters.push([]);
				continue;
			}
			const plain = target.type === 'Identifier';
			for (const binding of patternBindings(target, this.#module))
				this.#track(binding, [], plain, out, new Set());
			parameters.push(out.list());
		}
		return rest ? { parameters, rest } : { parameters };
	}

	#track(
		binding: Binding,
		base: Path,
		exact: boolean,
		out: WriteSet,
		seen: Set<string>,
		skip?: object,
	): void {
		const key = `${binding.id}:${exact}:${JSON.stringify(base)}`;
		if (seen.has(key)) return;
		seen.add(key);
		for (const reference of binding.references) {
			if (reference.inTypePosition || reference.isWrite || reference.node === skip) continue;
			this.#use(reference.node as unknown as AnyNode, base, exact, out, seen);
		}
	}

	// Follows one use of a tracked value up to the expression that decides what happens to it.
	#use(node: AnyNode, base: Path, exactBase: boolean, out: WriteSet, seen: Set<string>): void {
		const module = this.#module;
		const path = [...base];
		let exact = exactBase;
		let receiver: Path = path.slice();
		let method: string | null = null;
		let top = node;
		let member = false;
		for (;;) {
			const parent = parentOf(module, top);
			if (!parent) return;
			if (
				(VALUE_WRAPPERS.has(parent.type ?? '') && parent.expression === top) ||
				(parent.type === 'AwaitExpression' && parent.argument === top)
			) {
				top = parent;
				continue;
			}
			if (parent.type === 'MemberExpression' && parent.object === top) {
				receiver = path.slice();
				method = staticKey(parent);
				if (exact && method !== null) path.push(method);
				else exact = false;
				member = true;
				top = parent;
				continue;
			}
			if (
				(parent.type === 'ConditionalExpression' && parent.test !== top) ||
				parent.type === 'LogicalExpression' ||
				(parent.type === 'SequenceExpression' &&
					(parent.expressions as AnyNode[]).at(-1) === top)
			) {
				top = parent;
				continue;
			}
			// A new object or array holding the value is followed in its place, at no finer path.
			const holder = parentOf(module, parent);
			if (
				(parent.type === 'Property' && parent.value === top && holder?.type === 'ObjectExpression') ||
				parent.type === 'ArrayExpression' ||
				(parent.type === 'SpreadElement' &&
					(holder?.type === 'ObjectExpression' || holder?.type === 'ArrayExpression'))
			) {
				top = parent.type === 'ArrayExpression' ? parent : holder!;
				exact = false;
				member = false;
				method = null;
				receiver = path.slice();
				continue;
			}
			this.#decide(parent, top, { path, exact, receiver, method, member }, out, seen);
			return;
		}
	}

	#decide(
		parent: AnyNode,
		top: AnyNode,
		use: {
			readonly path: Path;
			readonly exact: boolean;
			readonly receiver: Path;
			readonly method: string | null;
			readonly member: boolean;
		},
		out: WriteSet,
		seen: Set<string>,
	): void {
		const { path, exact, receiver, method, member } = use;
		switch (parent.type) {
			case 'AssignmentExpression':
				if (parent.left === top) {
					if (member) out.add(path);
					return;
				}
				// Storing changes nothing; whatever it is stored in is followed, or assumed written when unnamed.
				this.#store(parent.left as AnyNode, path, out, seen);
				return;
			case 'UpdateExpression':
				if (member) out.add(path);
				return;
			case 'UnaryExpression':
				if (parent.operator === 'delete' && member) out.add(path);
				return;
			case 'ConditionalExpression':
				return;
			case 'VariableDeclarator':
				if (parent.init !== top) return;
				for (const alias of patternBindings(parent.id as AnyNode, this.#module))
					this.#track(
						alias,
						path,
						exact && (parent.id as AnyNode | undefined)?.type === 'Identifier',
						out,
						seen,
					);
				return;
			case 'AssignmentPattern':
				if (parent.right !== top) return;
				for (const alias of patternBindings(parent.left as AnyNode, this.#module))
					this.#track(alias, path, exact && (parent.left as AnyNode).type === 'Identifier', out, seen);
				return;
			case 'ForOfStatement':
			case 'ForInStatement':
				if (parent.left === top) {
					if (member) out.add(path);
					return;
				}
				if (parent.type === 'ForInStatement' || parent.right !== top) return;
				for (const alias of declaredBindings(parent.left as AnyNode, this.#module))
					this.#track(alias, path, false, out, seen);
				return;
			case 'CallExpression':
				if (parent.callee === top) {
					if (member) this.#methodCall(parent, receiver, method, out, seen);
					return;
				}
				if ((parent.arguments as AnyNode[]).includes(top)) {
					this.#argument(
						parent,
						(parent.arguments as AnyNode[]).indexOf(top),
						path,
						exact,
						out,
					);
					// What the call returns may be the value it was handed.
					this.#use(parent, path, false, out, seen);
				}
				return;
			case 'MemberExpression':
			case 'Property':
				if (parent.type === 'MemberExpression' && parent.property === top) return;
				if (parent.type === 'Property' && parent.key === top && parent.computed === true)
					return;
				out.add(path, true);
				return;
			default:
				if (!READING_PARENTS.has(parent.type ?? '')) out.add(path, true);
		}
	}

	#store(target: AnyNode, path: Path, out: WriteSet, seen: Set<string>): void {
		if (target.type !== 'MemberExpression') {
			for (const alias of patternBindings(target, this.#module))
				this.#track(alias, path, false, out, seen);
			return;
		}
		let root = unwrap(target);
		while (root.type === 'MemberExpression') root = unwrap(root.object as AnyNode);
		const binding =
			root.type === 'Identifier' ? (this.#module.referenceOf(root as never)?.binding ?? null) : null;
		if (!binding) {
			out.add(path, true);
			return;
		}
		// A write through the holder may or may not reach the stored value.
		const through = new WriteSet();
		this.#track(binding, path, false, through, seen, root);
		for (const write of through.list()) out.add(write.path, true);
	}

	#methodCall(
		call: AnyNode,
		receiver: Path,
		method: string | null,
		out: WriteSet,
		seen: Set<string>,
	): void {
		if (method === null) {
			out.add(receiver, true);
			return;
		}
		if (isMutatingCollectionMethod(method)) {
			out.add(receiver);
			return;
		}
		if (!READING_METHODS.has(method)) {
			out.add(receiver, true);
			return;
		}
		const args = (call.arguments as AnyNode[] | undefined) ?? [];
		if (method.startsWith('reduce'))
			// A reduce with no seed starts its accumulator at the first element.
			this.#callback(call, receiver, args.length < 2 ? [0, 1, 3] : [1, 3], out, seen);
		else if (method === 'toSorted') {
			if (args.length > 0) this.#callback(call, receiver, [0, 1], out, seen);
		} else if (ELEMENT_CALLBACK_METHODS.has(method))
			this.#callback(call, receiver, [0, 2], out, seen);
		if (ELEMENT_RESULT_METHODS.has(method)) this.#use(call, receiver, false, out, seen);
	}

	// `indexes` are the callback parameters handed an element or the array itself.
	#callback(
		call: AnyNode,
		receiver: Path,
		indexes: ReadonlyArray<number>,
		out: WriteSet,
		seen: Set<string>,
	): void {
		const args = (call.arguments as AnyNode[] | undefined) ?? [];
		const callback = unwrap((args[0] ?? call) as AnyNode);
		if (isFunctionNode(callback)) {
			const params = (callback.params as AnyNode[]) ?? [];
			for (const index of indexes)
				for (const alias of patternBindings(params[index], this.#module))
					this.#track(alias, receiver, false, out, seen);
			return;
		}
		const binding =
			callback.type === 'Identifier'
				? (this.#module.referenceOf(callback as never)?.binding ?? null)
				: null;
		const facts = binding ? this.ofBinding(binding) : null;
		if (!facts) {
			out.add(receiver, true);
			return;
		}
		for (const index of indexes)
			for (const write of argumentWrites(facts, index)) out.add(receiver, write.assumed);
	}

	#argument(call: AnyNode, index: number, path: Path, exact: boolean, out: WriteSet): void {
		const callee = unwrap(call.callee as AnyNode);
		// A spread before the value moves it to a parameter position no fact names.
		if ((call.arguments as AnyNode[]).slice(0, index).some((arg) => arg.type === 'SpreadElement')) {
			out.add(path, true);
			return;
		}
		if (callee.type === 'Identifier') {
			const binding = this.#module.referenceOf(callee as never)?.binding ?? null;
			if (!binding && READING_GLOBAL_CALLS.has(String(callee.name))) return;
			const facts = binding ? this.ofBinding(binding) : null;
			if (facts) {
				for (const write of argumentWrites(facts, index))
					out.add(exact ? [...path, ...write.path] : path, write.assumed);
				return;
			}
		} else if (callee.type === 'MemberExpression' && readsItsArguments(staticKey(callee))) {
			return;
		} else if (
			callee.type === 'MemberExpression' &&
			isGlobalReadingCall(callee, this.#module)
		) {
			return;
		}
		out.add(path, true);
	}
}

/** What a function with these facts writes below the value passed at `index`. */
export function argumentWrites(
	facts: FunctionParameterWrites,
	index: number,
): ReadonlyArray<ParameterWrite> {
	return index < facts.parameters.length ? facts.parameters[index]! : (facts.rest ?? []);
}

class WriteSet {
	readonly #writes = new Map<string, ParameterWrite>();

	add(path: Path, assumed?: true | boolean): void {
		const key = JSON.stringify(path);
		const known = this.#writes.get(key);
		if (known && (known.assumed || !assumed)) return;
		this.#writes.set(key, assumed ? { path: [...path], assumed: true } : { path: [...path] });
	}

	list(): ParameterWrite[] {
		const writes = [...this.#writes.values()];
		const whole = writes.find((write) => write.path.length === 0);
		if (!whole) return writes;
		return [writes.some((write) => write.assumed) ? { path: [], assumed: true } : whole];
	}
}

const PRIMITIVE_TYPES = new Set([
	'TSStringKeyword',
	'TSNumberKeyword',
	'TSBooleanKeyword',
	'TSBigIntKeyword',
	'TSSymbolKeyword',
	'TSNullKeyword',
	'TSUndefinedKeyword',
	'TSLiteralType',
]);

// A value declared a primitive has no members for the function to change.
function isPrimitiveType(annotation: AnyNode | undefined): boolean {
	const type =
		annotation?.type === 'TSTypeAnnotation'
			? (annotation.typeAnnotation as AnyNode)
			: annotation;
	if (!type) return false;
	if (type.type === 'TSUnionType')
		return ((type.types as AnyNode[]) ?? []).every((member) => isPrimitiveType(member));
	return PRIMITIVE_TYPES.has(type.type ?? '');
}

function functionOfBinding(binding: Binding, module: ModuleSemantics): AnyNode | null {
	if (binding.declarations.length !== 1) return null;
	if (binding.references.some((reference) => reference.isWrite)) return null;
	const name = binding.declarations[0] as unknown as AnyNode;
	const parent = parentOf(module, name);
	if (!parent) return null;
	if (parent.type === 'FunctionDeclaration' && parent.id === name) return parent;
	if (parent.type === 'VariableDeclarator' && parent.id === name && parent.init) {
		const init = unwrap(parent.init as AnyNode);
		return isFunctionNode(init) ? init : null;
	}
	return null;
}

function patternBindings(pattern: AnyNode | undefined, module: ModuleSemantics): Binding[] {
	const bindings: Binding[] = [];
	const visit = (node: AnyNode | undefined): void => {
		if (!node) return;
		switch (node.type) {
			case 'Identifier': {
				const binding = module.bindingOf(node as never);
				if (binding) bindings.push(binding);
				return;
			}
			case 'ObjectPattern':
				for (const property of (node.properties as AnyNode[]) ?? [])
					visit(property.type === 'RestElement' ? property : (property.value as AnyNode));
				return;
			case 'ArrayPattern':
				for (const element of (node.elements as Array<AnyNode | null>) ?? [])
					visit(element ?? undefined);
				return;
			case 'RestElement':
				visit(node.argument as AnyNode);
				return;
			case 'AssignmentPattern':
				visit(node.left as AnyNode);
				return;
		}
	};
	visit(pattern);
	return bindings;
}

function declaredBindings(left: AnyNode, module: ModuleSemantics): Binding[] {
	if (left.type !== 'VariableDeclaration') return patternBindings(left, module);
	return ((left.declarations as AnyNode[]) ?? []).flatMap((declarator) =>
		patternBindings(declarator.id as AnyNode, module),
	);
}

function usesArguments(fn: AnyNode, module: ModuleSemantics): boolean {
	if (fn.type === 'ArrowFunctionExpression') return false;
	const start = fn.start as number;
	const end = fn.end as number;
	return module.unresolvedReferences.some(
		(reference) =>
			reference.name === 'arguments' &&
			reference.node.start >= start &&
			reference.node.end <= end,
	);
}

function isGlobalReadingCall(callee: AnyNode, module: ModuleSemantics): boolean {
	const object = unwrap(callee.object as AnyNode);
	const property = staticKey(callee);
	if (object.type !== 'Identifier' || property === null) return false;
	if (module.referenceOf(object as never)?.binding) return false;
	return READING_GLOBAL_CALLS.has(`${String(object.name)}.${property}`);
}

// A reduce hands its seed to the callback, which may change it.
// Builtin array and string readers whose names user objects rarely reuse for methods that change an argument.
const ARGUMENT_READING_METHODS = new Set([
	'at',
	'charAt',
	'charCodeAt',
	'codePointAt',
	'endsWith',
	'includes',
	'indexOf',
	'join',
	'lastIndexOf',
	'localeCompare',
	'padEnd',
	'padStart',
	'repeat',
	'slice',
	'split',
	'startsWith',
	'substring',
	'toFixed',
	'toPrecision',
]);

function readsItsArguments(method: string | null): boolean {
	return method !== null && ARGUMENT_READING_METHODS.has(method);
}

function staticKey(member: AnyNode): string | null {
	const property = member.property as AnyNode | undefined;
	if (!property) return null;
	if (member.computed !== true) return typeof property.name === 'string' ? property.name : null;
	return property.type === 'Literal' &&
		(typeof property.value === 'string' || typeof property.value === 'number')
		? String(property.value)
		: null;
}

function unwrap(node: AnyNode): AnyNode {
	let current = node;
	while (VALUE_WRAPPERS.has(current.type ?? '') && current.expression)
		current = current.expression as AnyNode;
	return current;
}

function isFunctionNode(node: AnyNode | undefined): boolean {
	return node?.type === 'ArrowFunctionExpression' || node?.type === 'FunctionExpression';
}

function parentOf(module: ModuleSemantics, node: AnyNode): AnyNode | null {
	return module.parentOf(node as never) as unknown as AnyNode | null;
}
