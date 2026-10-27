import { asNodes, unwrapTypeAssertion, type AnyNode } from '../../ast/nodes.ts';
import type { FunctionEffect, ParameterEffect } from '../../artifacts.ts';
import { isPrimitiveType } from './primitive-values.ts';
import { moduleSemantics, type ModuleSemantics } from './shared-ast.ts';

type Binding = ModuleSemantics['bindings'][number];

/** What a function call does with a value handed to it, as far as this module can see. */
export type CalleeEffect =
	| { readonly kind: 'pure' }
	| { readonly kind: 'effect'; readonly name: string; readonly effect: ParameterEffect }
	| { readonly kind: 'unseen'; readonly name: string };

// Globals that read their arguments and keep none of them.
const PURE_GLOBALS = new Set([
	'Boolean',
	'Number',
	'String',
	'BigInt',
	'Symbol',
	'isFinite',
	'isNaN',
	'parseFloat',
	'parseInt',
	'encodeURI',
	'encodeURIComponent',
	'decodeURI',
	'decodeURIComponent',
	'structuredClone',
	'alert',
	'confirm',
	'prompt',
]);

// Static methods of built-in namespaces that read their arguments and keep none of them.
const PURE_STATICS: Readonly<Record<string, ReadonlySet<string>>> = {
	JSON: new Set(['stringify', 'parse']),
	Math: new Set(Object.getOwnPropertyNames(Math)),
	Object: new Set([
		'entries',
		'fromEntries',
		'getOwnPropertyNames',
		'getPrototypeOf',
		'hasOwn',
		'is',
		'isExtensible',
		'isFrozen',
		'isSealed',
		'keys',
		'values',
	]),
	Array: new Set(['from', 'isArray', 'of']),
	Number: new Set(['isFinite', 'isInteger', 'isNaN', 'isSafeInteger', 'parseFloat', 'parseInt']),
	String: new Set(['fromCharCode', 'fromCodePoint', 'raw']),
	Date: new Set(['now', 'parse', 'UTC']),
	console: new Set(['debug', 'dir', 'error', 'info', 'log', 'table', 'trace', 'warn']),
	Reflect: new Set(['get', 'getOwnPropertyDescriptor', 'getPrototypeOf', 'has', 'ownKeys']),
	Promise: new Set(['resolve', 'all', 'allSettled', 'any', 'race']),
};

// Constructors that copy or read what they are handed.
const PURE_CONSTRUCTORS = new Set([
	'Event',
	'FocusEvent',
	'InputEvent',
	'KeyboardEvent',
	'MouseEvent',
	'PointerEvent',
	'Date',
	'Error',
	'Intl.DateTimeFormat',
	'Intl.NumberFormat',
	'RegExp',
	'URL',
	'URLSearchParams',
	'TypeError',
	'RangeError',
]);

// Methods that change the array, Map, Set or Date they are called on.
const MUTATING_METHODS = new Set([
	'add',
	'clear',
	'copyWithin',
	'delete',
	'fill',
	'pop',
	'push',
	'reverse',
	'set',
	'shift',
	'sort',
	'splice',
	'unshift',
	'setDate',
	'setFullYear',
	'setHours',
	'setMilliseconds',
	'setMinutes',
	'setMonth',
	'setSeconds',
	'setTime',
	'setUTCDate',
	'setUTCFullYear',
	'setUTCHours',
	'setUTCMilliseconds',
	'setUTCMinutes',
	'setUTCMonth',
	'setUTCSeconds',
]);
// Array methods that run their callback before they return, handing it each element.
const SYNC_CALLBACK_METHODS = new Set([
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

// Methods whose result still holds the value or a part of it.
const ALIAS_RETURNING_METHODS = new Set([
	'at',
	'concat',
	'entries',
	'filter',
	'find',
	'findLast',
	'flat',
	'flatMap',
	'get',
	'map',
	'slice',
	'toReversed',
	'toSorted',
	'toSpliced',
	'values',
	'with',
]);
// Built-in methods that read the value, or keep only its string, and hand none of it back.
const READ_METHODS = new Set([
	'charAt',
	'charCodeAt',
	'codePointAt',
	'endsWith',
	'findIndex',
	'findLastIndex',
	'forEach',
	'getDate',
	'getDay',
	'getFullYear',
	'getHours',
	'getMilliseconds',
	'getMinutes',
	'getMonth',
	'getSeconds',
	'getTime',
	'getTimezoneOffset',
	'has',
	'hasOwnProperty',
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
	'repeat',
	'replace',
	'replaceAll',
	'search',
	'setAttribute',
	'setAttributeNS',
	'split',
	'startsWith',
	'substring',
	'toDateString',
	'toFixed',
	'toISOString',
	'toJSON',
	'toLocaleDateString',
	'toLocaleString',
	'toLocaleTimeString',
	'toLowerCase',
	'toPrecision',
	'toString',
	'toTimeString',
	'toUpperCase',
	'trim',
	'trimEnd',
	'trimStart',
	'valueOf',
]);

const NO_EFFECT: ParameterEffect = { mutates: [], retains: [], unseen: [] };

/** What each exported function of a script module does with the values handed to it; undefined when it does not analyze. */
export function summarizeModuleFunctions(input: {
	readonly filename: string;
	readonly source: string;
	/** Summaries of the modules this one imports, by specifier and export name. */
	readonly imported?: (specifier: string, name: string) => FunctionEffect | undefined;
}): Readonly<Record<string, FunctionEffect>> | undefined {
	let module: ModuleSemantics;
	try {
		module = moduleSemantics(input.source, input.filename);
	} catch {
		return undefined;
	}
	if (module.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) return undefined;
	const summaries: Record<string, FunctionEffect> = {};
	const effects = createFunctionEffects(module, input.imported ?? (() => undefined));
	for (const exported of module.exports) {
		if (!exported.name || !exported.local) continue;
		const fn = functionOfBinding(module, exported.local);
		if (fn) summaries[exported.name] = effects.ofFunction(fn);
		else if (changedInModule(module, exported.local)) {
			summaries[exported.name] = { parameters: [], changedByItsModule: true };
		}
	}
	return summaries;
}

export type FunctionEffects = {
	readonly ofFunction: (fn: AnyNode) => FunctionEffect;
	readonly ofCallee: (call: AnyNode, argumentIndex: number, within?: AnyNode) => CalleeEffect;
};

// `imported` answers for an imported callee by specifier and name; undefined is a function this compile cannot see.
export function createFunctionEffects(
	module: ModuleSemantics,
	imported: (specifier: string, name: string) => FunctionEffect | undefined,
): FunctionEffects {
	const memo = new Map<AnyNode, FunctionEffect>();
	const active = new Set<AnyNode>();

	const ofFunction = (fn: AnyNode): FunctionEffect => {
		const known = memo.get(fn);
		if (known) return known;
		// A recursive call adds nothing the outer walk does not already see.
		if (active.has(fn)) return { parameters: asNodes(fn.params).map(() => NO_EFFECT) };
		active.add(fn);
		const parameters = asNodes(fn.params).map((param) => {
			const effect = parameterEffect(fn, param);
			// An async or generator body can make its change after the call has returned.
			return fn.async === true || fn.generator === true
				? {
						...effect,
						mutates: [],
						retains: [
							...effect.retains,
							...effect.mutates.map((path) => path && path.slice(0, -1)),
						],
					}
				: effect;
		});
		active.delete(fn);
		const effect = { parameters };
		memo.set(fn, effect);
		return effect;
	};

	const parameterEffect = (fn: AnyNode, param: AnyNode): ParameterEffect => {
		// A parameter typed as a string, number or boolean cannot be handed an object in code that type-checks.
		if (isPrimitiveType(unwrapPattern(param).typeAnnotation as AnyNode | undefined))
			return NO_EFFECT;
		const names = patternBindings(module, param);
		const destructured = unwrapPattern(param).type !== 'Identifier';
		const tracker = createTracker(fn);
		for (const binding of names) tracker.follow(binding, destructured ? null : []);
		return tracker.result();
	};

	const createTracker = (fn: AnyNode) => {
		const mutates: Array<string[] | null> = [];
		const unseen: Array<{ callee: string; path: string[] | null }> = [];
		const retains: Array<string[] | null> = [];
		const seen = new Set<number>();

		// `base` is the path from the parameter to what the binding holds; null is somewhere inside it.
		const follow = (binding: Binding, base: string[] | null): void => {
			if (seen.has(binding.id)) return;
			seen.add(binding.id);
			for (const reference of binding.references) {
				if (reference.inTypePosition || reference.isWrite) continue;
				use(reference.node as unknown as AnyNode, base);
			}
		};

		const use = (node: AnyNode, base: string[] | null): void => {
			if (!isInside(fn, node)) return;
			if (escapesThroughClosure(module, fn, node)) {
				retains.push(base);
				return;
			}
			let path = base;
			let expression = node;
			for (;;) {
				const parent = parentOf(module, expression);
				if (!parent) return;
				if (isTransparent(parent, expression) || isBranch(parent, expression)) {
					expression = parent;
					continue;
				}
				if (isLiteralMember(module, parent, expression)) {
					path = null;
					expression = literalOf(module, parent);
					continue;
				}
				// `new Map(entries)` holds what it is handed: followed through the new container.
				if (isContainerConstruction(module, parent, expression)) {
					path = null;
					expression = parent;
					continue;
				}
				if (parent.type === 'MemberExpression' && parent.object === expression) {
					const key = memberKey(parent);
					const outer = parentOf(module, parent);
					if (outer?.type === 'CallExpression' && outer.callee === parent) {
						if (!methodCall(outer, key, path)) return;
						path = null;
						expression = outer;
						continue;
					}
					path = key === null || path === null ? null : [...path, key];
					expression = parent;
					continue;
				}
				break;
			}
			const parent = parentOf(module, expression);
			if (parent) consume(parent, expression, path);
		};

		// A method called on the value; true when its result still holds a part of it.
		const methodCall = (
			call: AnyNode,
			method: string | null,
			path: string[] | null,
		): boolean => {
			if (method === null) {
				unseen.push({ callee: 'a computed method', path });
				return false;
			}
			if (MUTATING_METHODS.has(method)) {
				mutates.push(path);
				return false;
			}
			if (SYNC_CALLBACK_METHODS.has(method)) {
				const [callback] = asNodes(call.arguments);
				const fnArgument = callback && unwrapTypeAssertion(callback);
				if (fnArgument && isFunctionNode(fnArgument)) {
					const elementIndex = method === 'reduce' || method === 'reduceRight' ? 1 : 0;
					const element = asNodes(fnArgument.params)[elementIndex];
					if (element) {
						for (const binding of patternBindings(module, element))
							follow(binding, null);
					}
				}
			}
			if (ALIAS_RETURNING_METHODS.has(method)) return true;
			if (!READ_METHODS.has(method) && !SYNC_CALLBACK_METHODS.has(method)) {
				unseen.push({ callee: `.${method}`, path });
			}
			return false;
		};

		const consume = (parent: AnyNode, expression: AnyNode, path: string[] | null): void => {
			switch (parent.type) {
				case 'AssignmentExpression':
					if (parent.left === expression) {
						if (expression.type !== 'Identifier') mutates.push(path);
						return;
					}
					storeInto(parent.left as AnyNode, path);
					return;
				case 'UpdateExpression':
					if (expression.type !== 'Identifier') mutates.push(path);
					return;
				case 'UnaryExpression':
					if (parent.operator === 'delete') mutates.push(path);
					return;
				case 'VariableDeclarator':
					if (parent.init === expression) {
						const destructured =
							unwrapPattern(parent.id as AnyNode).type !== 'Identifier';
						for (const binding of patternBindings(module, parent.id as AnyNode)) {
							follow(binding, destructured ? null : path);
						}
					}
					return;
				case 'ForOfStatement':
					if (parent.right === expression) {
						const left = parent.left as AnyNode;
						const declaration =
							left.type === 'VariableDeclaration'
								? (asNodes(left.declarations)[0]?.id as AnyNode)
								: left;
						for (const binding of patternBindings(module, declaration))
							follow(binding, null);
					}
					return;
				case 'CallExpression':
				case 'NewExpression': {
					const index = asNodes(parent.arguments).indexOf(expression);
					if (index < 0) return;
					const callee = ofCallee(parent, index, fn);
					if (callee.kind === 'pure') return;
					if (callee.kind === 'unseen') {
						unseen.push({ callee: callee.name, path });
						return;
					}
					const within = (inner: ReadonlyArray<string> | null) =>
						path === null || inner === null ? null : [...path, ...inner];
					for (const mutated of callee.effect.mutates) mutates.push(within(mutated));
					for (const kept of callee.effect.retains) retains.push(within(kept));
					for (const pass of callee.effect.unseen) {
						unseen.push({ callee: pass.callee, path: within(pass.path) });
					}
					return;
				}
				case 'SpreadElement': {
					const holder = parentOf(module, parent);
					if (holder?.type === 'CallExpression' || holder?.type === 'NewExpression') {
						const callee = ofCallee(
							holder,
							asNodes(holder.arguments).indexOf(parent),
							fn,
						);
						if (callee.kind === 'unseen')
							unseen.push({ callee: callee.name, path: null });
						else if (callee.kind === 'effect') retains.push(null);
					}
					return;
				}
				case 'ReturnStatement':
				case 'ArrowFunctionExpression':
				case 'YieldExpression':
					// What the function gives back is the caller's to track: a write through it is refused there.
					return;
				default:
					return;
			}
		};

		// `x = p` keeps a second name for it; `obj.k = p` stores it somewhere this function does not own.
		const storeInto = (left: AnyNode, path: string[] | null): void => {
			let target = unwrapTypeAssertion(left);
			let held = path;
			// `next[1] = p` puts it into a local the function owns, followed like the local itself.
			while (target?.type === 'MemberExpression') {
				target = unwrapTypeAssertion(target.object as AnyNode | undefined);
				held = null;
			}
			if (target?.type === 'Identifier') {
				const binding = module.bindingOf(target as never);
				if (binding && isInside(fn, binding.declarations[0] as unknown as AnyNode)) {
					follow(binding, held);
					return;
				}
			}
			retains.push(path);
		};

		return {
			follow,
			result: (): ParameterEffect => ({
				mutates: uniqueBy(mutates, (path) => JSON.stringify(path)),
				retains: uniqueBy(retains, (path) => JSON.stringify(path)),
				unseen: uniqueBy(unseen, (pass) => JSON.stringify(pass)),
			}),
		};
	};

	const ofCallee = (call: AnyNode, argumentIndex: number, within?: AnyNode): CalleeEffect => {
		const callee = unwrapTypeAssertion(call.callee as AnyNode | undefined);
		if (!callee) return { kind: 'unseen', name: 'the function it computes' };
		const name = calleeName(callee);
		if (call.optional === true || callee.type === 'ChainExpression')
			return { kind: 'unseen', name };

		if (callee.type === 'Identifier') {
			const binding = module.bindingOf(callee as never);
			if (!binding) {
				if (call.type === 'NewExpression') {
					return PURE_CONSTRUCTORS.has(name)
						? { kind: 'pure' }
						: { kind: 'unseen', name };
				}
				return PURE_GLOBALS.has(name) ? { kind: 'pure' } : { kind: 'unseen', name };
			}
			const importRecord = module.imports.find((record) => record.local?.id === binding.id);
			if (importRecord) {
				if (importRecord.specifier.startsWith('@markless/')) return { kind: 'pure' };
				const summary = imported(importRecord.specifier, importRecord.name ?? 'default');
				return parameterOf(summary, argumentIndex, name);
			}
			const fn = functionOfBinding(module, binding);
			if (fn) return parameterOf(ofFunction(fn), argumentIndex, name);
			return { kind: 'unseen', name };
		}

		if (callee.type === 'MemberExpression' && callee.computed !== true) {
			const method = (callee.property as AnyNode | undefined)?.name;
			const owner = unwrapTypeAssertion(callee.object as AnyNode | undefined);
			if (typeof method !== 'string' || !owner) return { kind: 'unseen', name };
			if (owner.type === 'Identifier') {
				const binding = module.bindingOf(owner as never);
				if (!binding) {
					if (owner.name === 'Object' && method === 'assign') {
						return argumentIndex === 0
							? {
									kind: 'effect',
									name,
									effect: { mutates: [[]], retains: [], unseen: [] },
								}
							: { kind: 'pure' };
					}
					const statics = PURE_STATICS[owner.name as string];
					if (statics?.has(method)) return { kind: 'pure' };
					if (owner.name === 'Intl') return { kind: 'pure' };
					return { kind: 'unseen', name };
				}
				const namespace = module.imports.find(
					(record) => record.local?.id === binding.id && record.isNamespace,
				);
				if (namespace) {
					return parameterOf(imported(namespace.specifier, method), argumentIndex, name);
				}
			}
			if (owner.type === 'Identifier' && isStringifyingContainer(module, owner))
				return { kind: 'pure' };
			if ((method === 'test' || method === 'exec') && isRegExp(module, owner))
				return { kind: 'pure' };
			// A value put into a local array, Map or object is followed through that local where it is written.
			if (owner.type === 'Identifier' && isLocalContainer(module, owner, within))
				return { kind: 'pure' };
			// An argument put into an array, Map or Set stays there after the call.
			if (MUTATING_METHODS.has(method)) {
				return { kind: 'effect', name, effect: { mutates: [], retains: [[]], unseen: [] } };
			}
			if (READ_METHODS.has(method) || ALIAS_RETURNING_METHODS.has(method))
				return { kind: 'pure' };
			return { kind: 'unseen', name };
		}

		return { kind: 'unseen', name };
	};

	return { ofFunction, ofCallee };
}

function parameterOf(
	summary: FunctionEffect | undefined,
	index: number,
	name: string,
): CalleeEffect {
	if (!summary) return { kind: 'unseen', name };
	const effect = summary.parameters[index];
	if (!effect) return { kind: 'pure' };
	if (effect.mutates.length === 0 && effect.retains.length === 0 && effect.unseen.length === 0) {
		return { kind: 'pure' };
	}
	return { kind: 'effect', name, effect };
}

// A value the module reassigns, or writes into, anywhere in its own code.
function changedInModule(module: ModuleSemantics, binding: Binding): boolean {
	for (const reference of binding.references) {
		if (reference.inTypePosition) continue;
		if (reference.isWrite) return true;
		let expression = reference.node as unknown as AnyNode;
		for (;;) {
			const parent = parentOf(module, expression);
			if (!parent) break;
			if (isTransparent(parent, expression)) {
				expression = parent;
				continue;
			}
			if (parent.type === 'MemberExpression' && parent.object === expression) {
				const outer = parentOf(module, parent);
				const method =
					parent.computed === true
						? null
						: (parent.property as AnyNode | undefined)?.name;
				if (outer?.type === 'CallExpression' && outer.callee === parent) {
					if (typeof method === 'string' && MUTATING_METHODS.has(method)) return true;
					break;
				}
				expression = parent;
				continue;
			}
			if (expression !== (reference.node as unknown as AnyNode)) {
				if (parent.type === 'AssignmentExpression' && parent.left === expression)
					return true;
				if (parent.type === 'UpdateExpression') return true;
				if (parent.type === 'UnaryExpression' && parent.operator === 'delete') return true;
			}
			break;
		}
	}
	return false;
}

// URLSearchParams, FormData and Headers turn what they are given into strings.
const STRINGIFYING_CONSTRUCTORS = new Set(['URLSearchParams', 'FormData', 'Headers']);

function isStringifyingContainer(module: ModuleSemantics, identifier: AnyNode): boolean {
	const binding = module.bindingOf(identifier as never);
	const declaration = binding?.declarations[0] as unknown as AnyNode | undefined;
	const declarator = declaration && parentOf(module, declaration);
	const init =
		declarator?.type === 'VariableDeclarator'
			? unwrapTypeAssertion(declarator.init as AnyNode)
			: undefined;
	const callee =
		init?.type === 'NewExpression' ? (init.callee as AnyNode | undefined) : undefined;
	return (
		callee?.type === 'Identifier' &&
		STRINGIFYING_CONSTRUCTORS.has(callee.name as string) &&
		!module.bindingOf(callee as never)
	);
}

function isRegExp(module: ModuleSemantics, node: AnyNode): boolean {
	if (node.type === 'Literal' && 'regex' in node) return true;
	if (node.type !== 'Identifier') return false;
	const binding = module.bindingOf(node as never);
	if (!binding || binding.references.some((reference) => reference.isWrite)) return false;
	const declaration = binding.declarations[0] as unknown as AnyNode | undefined;
	const declarator = declaration && parentOf(module, declaration);
	const init =
		declarator?.type === 'VariableDeclarator'
			? unwrapTypeAssertion(declarator.init as AnyNode | undefined)
			: undefined;
	if (!init) return false;
	if (init.type === 'Literal' && 'regex' in init) return true;
	const callee = init.type === 'NewExpression' ? (init.callee as AnyNode | undefined) : undefined;
	return (
		callee?.type === 'Identifier' &&
		callee.name === 'RegExp' &&
		!module.bindingOf(callee as never)
	);
}

const CONTAINER_CONSTRUCTORS = new Set(['Array', 'Map', 'Set', 'WeakMap', 'WeakSet']);

function isContainerConstruction(
	module: ModuleSemantics,
	node: AnyNode,
	argument: AnyNode,
): boolean {
	const callee = node.type === 'NewExpression' ? (node.callee as AnyNode | undefined) : undefined;
	return (
		callee?.type === 'Identifier' &&
		CONTAINER_CONSTRUCTORS.has(callee.name as string) &&
		!module.bindingOf(callee as never) &&
		asNodes(node.arguments)[0] === argument
	);
}

// Inside a summarized function only its own containers count: a module-level one outlives the call.
function isLocalContainer(module: ModuleSemantics, identifier: AnyNode, within?: AnyNode): boolean {
	const binding = module.bindingOf(identifier as never);
	if (!binding || module.imports.some((record) => record.local?.id === binding.id)) return false;
	const declaration = binding.declarations[0] as unknown as AnyNode | undefined;
	const declarator = declaration && parentOf(module, declaration);
	if (declarator?.type !== 'VariableDeclarator') return false;
	if (within && !isInside(within, declarator)) return false;
	const init = unwrapTypeAssertion(declarator.init as AnyNode | undefined);
	if (init?.type === 'ArrayExpression' || init?.type === 'ObjectExpression') return true;
	const callee =
		init?.type === 'NewExpression' ? (init.callee as AnyNode | undefined) : undefined;
	return (
		callee?.type === 'Identifier' &&
		CONTAINER_CONSTRUCTORS.has(callee.name as string) &&
		!module.bindingOf(callee as never)
	);
}

/** The function a name is declared as: `function f() {}`, or `const f = () => {}` never reassigned. */
export function functionOfBinding(module: ModuleSemantics, binding: Binding): AnyNode | null {
	const declaration = binding.declarations[0] as unknown as AnyNode | undefined;
	if (!declaration) return null;
	const parent = parentOf(module, declaration);
	if (!parent) return null;
	if (isFunctionNode(parent) && parent.id === declaration) return parent;
	if (parent.type === 'VariableDeclarator' && parent.id === declaration) {
		if (binding.references.some((reference) => reference.isWrite)) return null;
		const init = unwrapTypeAssertion(parent.init as AnyNode | undefined);
		return init && isFunctionNode(init) ? init : null;
	}
	return null;
}

/** The import specifiers of a script module, for a host that summarizes what it imports first. */
export function moduleImportSpecifiers(input: {
	readonly filename: string;
	readonly source: string;
}): string[] {
	try {
		return [
			...new Set(
				moduleSemantics(input.source, input.filename).imports.map(
					(record) => record.specifier,
				),
			),
		];
	} catch {
		return [];
	}
}

export function calleeName(callee: AnyNode): string {
	if (callee.type === 'Identifier') return String(callee.name);
	if (callee.type === 'MemberExpression' && callee.computed !== true) {
		const object = unwrapTypeAssertion(callee.object as AnyNode | undefined);
		const property = (callee.property as AnyNode | undefined)?.name;
		const owner = object ? calleeName(object) : '';
		return owner && typeof property === 'string'
			? `${owner}.${property}`
			: 'the function it computes';
	}
	if (callee.type === 'ThisExpression') return 'this';
	return 'the function it computes';
}

function patternBindings(module: ModuleSemantics, pattern: AnyNode): Binding[] {
	const bindings: Binding[] = [];
	const visit = (node: AnyNode | undefined): void => {
		const current = node && unwrapPattern(node);
		if (!current) return;
		if (current.type === 'Identifier') {
			const binding = module.bindingOf(current as never);
			if (binding) bindings.push(binding);
			return;
		}
		if (current.type === 'ObjectPattern') {
			for (const property of asNodes(current.properties)) {
				visit(
					(property.type === 'RestElement'
						? property.argument
						: property.value) as AnyNode,
				);
			}
			return;
		}
		if (current.type === 'ArrayPattern') {
			for (const element of asNodes(current.elements)) visit(element);
			return;
		}
		if (current.type === 'RestElement') visit(current.argument as AnyNode);
	};
	visit(pattern);
	return bindings;
}

function unwrapPattern(node: AnyNode): AnyNode {
	let current = node;
	while (current.type === 'AssignmentPattern' || current.type === 'TSParameterProperty') {
		current = (current.left ?? current.parameter) as AnyNode;
	}
	return current;
}

function parentOf(module: ModuleSemantics, node: AnyNode): AnyNode | null {
	return module.parentOf(node as never) as unknown as AnyNode | null;
}

// `cond ? p : q`, `p || fallback`, `await p`: the result can be the value itself.
function isBranch(parent: AnyNode, child: AnyNode): boolean {
	if (parent.type === 'ConditionalExpression') return parent.test !== child;
	if (parent.type === 'LogicalExpression') return true;
	return parent.type === 'AwaitExpression';
}

// The value placed into a new array or object literal, directly or spread.
function isLiteralMember(module: ModuleSemantics, parent: AnyNode, child: AnyNode): boolean {
	if (parent.type === 'ArrayExpression') return true;
	if (parent.type === 'Property') {
		return parent.value === child && parentOf(module, parent)?.type === 'ObjectExpression';
	}
	if (parent.type === 'SpreadElement') {
		const holder = parentOf(module, parent);
		return holder?.type === 'ArrayExpression' || holder?.type === 'ObjectExpression';
	}
	return false;
}

function literalOf(module: ModuleSemantics, member: AnyNode): AnyNode {
	return member.type === 'ArrayExpression' ? member : parentOf(module, member)!;
}

function isTransparent(parent: AnyNode, child: AnyNode): boolean {
	if (parent.type === 'ChainExpression' || parent.type === 'ParenthesizedExpression') return true;
	if (parent.type === 'TSAsExpression' || parent.type === 'TSNonNullExpression') return true;
	if (parent.type === 'TSSatisfiesExpression' || parent.type === 'TSTypeAssertion') return true;
	return parent.type === 'SequenceExpression' && asNodes(parent.expressions).at(-1) === child;
}

function memberKey(member: AnyNode): string | null {
	const property = member.property as AnyNode | undefined;
	if (!property) return null;
	if (member.computed !== true) return typeof property.name === 'string' ? property.name : null;
	if (
		property.type === 'Literal' &&
		(typeof property.value === 'string' || typeof property.value === 'number')
	) {
		return String(property.value);
	}
	return null;
}

function uniqueBy<T>(values: ReadonlyArray<T>, keyOf: (value: T) => string): T[] {
	const keys = new Set<string>();
	return values.filter((value) => {
		const key = keyOf(value);
		if (keys.has(key)) return false;
		keys.add(key);
		return true;
	});
}

function isFunctionNode(node: AnyNode): boolean {
	return (
		node.type === 'ArrowFunctionExpression' ||
		node.type === 'FunctionExpression' ||
		node.type === 'FunctionDeclaration'
	);
}

function isInside(container: AnyNode, node: AnyNode | undefined): boolean {
	return (
		!!node &&
		typeof node.start === 'number' &&
		typeof container.start === 'number' &&
		node.start >= container.start &&
		(node.end as number) <= (container.end as number)
	);
}

// A use inside a function nested in `fn` that may run after the call returns: a timer callback, a returned closure.
function escapesThroughClosure(module: ModuleSemantics, fn: AnyNode, node: AnyNode): boolean {
	let cursor = parentOf(module, node);
	while (cursor && cursor !== fn) {
		if (isFunctionNode(cursor) && !isSyncCallback(module, cursor)) return true;
		cursor = parentOf(module, cursor);
	}
	return false;
}

function isSyncCallback(module: ModuleSemantics, callback: AnyNode): boolean {
	const call = parentOf(module, callback);
	if (call?.type !== 'CallExpression') return false;
	if (call.callee === callback) return true;
	const callee = unwrapTypeAssertion(call.callee as AnyNode | undefined);
	const method =
		callee?.type === 'MemberExpression' ? (callee.property as AnyNode | undefined)?.name : null;
	return (
		asNodes(call.arguments)[0] === callback &&
		typeof method === 'string' &&
		SYNC_CALLBACK_METHODS.has(method)
	);
}
