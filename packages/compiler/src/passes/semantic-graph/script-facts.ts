import { BindingFlags, generate } from '@tsrx/yuku';
import type { AnyNode } from '../../ast/nodes.ts';
import type {
	SemanticScriptDeviceCall,
	SemanticScriptExport,
	SemanticScriptFunction,
	SemanticScriptGlobal,
	SemanticScriptModule,
	SemanticScriptStatement,
	SourceSpan,
} from '../../artifacts.ts';
import { DEVICE_CALLS, DEVICE_MODULE } from '@markless/serializer/native-device';
import { moduleSemantics, type ModuleSemantics } from './shared-ast.ts';

// Script facts read yuku's scope analysis only: what each name resolves to decides how the emitted JavaScript reaches it.

type Binding = ModuleSemantics['bindings'][number];
type Reference = ModuleSemantics['references'][number];

const PRINT = { strip: true, format: 'pretty', indent: 1, comments: false } as const;
const FRAMEWORK_PREFIX = '@markless/';
const GLOBAL_OBJECTS = new Set(['window', 'globalThis', 'self']);

const isNode = (value: unknown): value is AnyNode =>
	value !== null &&
	typeof value === 'object' &&
	typeof (value as { type?: unknown }).type === 'string';

const spanOf = (node: { start: number; end: number }, filename: string): SourceSpan => ({
	filename,
	start: node.start,
	end: node.end,
});

const within = (node: { start: number; end: number }, outer: { start: number; end: number }) =>
	node.start >= outer.start && node.end <= outer.end;

/** `import.meta.env` as the web's production client build (Vite) defines it. */
const CLIENT_ENV: Readonly<Record<string, boolean | string>> = {
	SSR: false,
	DEV: false,
	PROD: true,
	MODE: 'production',
};

const unchained = (node: AnyNode): AnyNode =>
	node.type === 'ChainExpression' ? (node.expression as AnyNode) : node;
const propertyName = (node: AnyNode): string | undefined =>
	!node.computed && (node.property as AnyNode | undefined)?.type === 'Identifier'
		? String((node.property as AnyNode).name)
		: undefined;

/** The value `import.meta.env.<name>` has in the web's client build, when the build defines it. */
function clientEnvValue(node: AnyNode): boolean | string | undefined {
	const read = unchained(node);
	if (read.type !== 'MemberExpression') return undefined;
	const env = read.object as AnyNode;
	if (
		env.type !== 'MemberExpression' ||
		(env.object as AnyNode).type !== 'MetaProperty' ||
		propertyName(env) !== 'env'
	)
		return undefined;
	const name = propertyName(read);
	return name !== undefined && Object.hasOwn(CLIENT_ENV, name) ? CLIENT_ENV[name] : undefined;
}

/** The branch an `if` or `?:` on an `import.meta.env` value takes in a client build; the other is dead code there. */
function takenBranch(
	node: AnyNode,
): { readonly taken: AnyNode | null; readonly dead: AnyNode | null } | undefined {
	if (node.type !== 'IfStatement' && node.type !== 'ConditionalExpression') return undefined;
	let test = node.test as AnyNode;
	let negated = false;
	while (test.type === 'UnaryExpression' && test.operator === '!') {
		negated = !negated;
		test = test.argument as AnyNode;
	}
	const value = clientEnvValue(test);
	if (value === undefined) return undefined;
	const consequent = node.consequent as AnyNode;
	const alternate = (node.alternate as AnyNode | null | undefined) ?? null;
	return Boolean(value) !== negated
		? { taken: consequent, dead: alternate }
		: { taken: alternate, dead: consequent };
}

/** The branches a client build never runs, whose names a script does not need. */
function deadIn(node: AnyNode, into: AnyNode[] = []): AnyNode[] {
	const branch = takenBranch(node);
	if (branch?.dead) into.push(branch.dead);
	for (const value of Object.values(node)) {
		if (Array.isArray(value)) {
			for (const item of value) if (isNode(item)) deadIn(item, into);
		} else if (isNode(value)) deadIn(value, into);
	}
	return into;
}

/** `import.meta.url`: the `import.meta` member path a node reads, when it reads one. */
function metaPath(node: AnyNode): string | undefined {
	if (node.type === 'MetaProperty') return 'import.meta';
	const read = unchained(node);
	if (read.type !== 'MemberExpression') return undefined;
	const object = metaPath(read.object as AnyNode);
	const name = propertyName(read);
	return object && (name ? `${object}.${name}` : object);
}

const identifier = (name: string): AnyNode => ({ type: 'Identifier', name }) as AnyNode;
const member = (object: AnyNode, property: string | number): AnyNode =>
	({
		type: 'MemberExpression',
		object,
		property: { type: 'Literal', value: property, raw: JSON.stringify(property) },
		computed: true,
		optional: false,
	}) as unknown as AnyNode;
const stateName = (name: string): AnyNode =>
	({
		type: 'MemberExpression',
		object: identifier('__s'),
		property: identifier(name),
		computed: false,
		optional: false,
	}) as unknown as AnyNode;

/** A copy of `node` with each node `replace` answers swapped for its answer. */
function cloneWith(node: AnyNode, replace: (node: AnyNode) => AnyNode | undefined): AnyNode {
	const swapped = replace(node);
	if (swapped) return swapped;
	const branch = takenBranch(node);
	if (branch)
		return branch.taken
			? cloneWith(branch.taken, replace)
			: ({ type: 'EmptyStatement' } as AnyNode);
	const env = clientEnvValue(node);
	if (env !== undefined) return { type: 'Literal', value: env, raw: JSON.stringify(env) } as AnyNode;
	const copy: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(node)) {
		if (Array.isArray(value))
			copy[key] = value.map((item) => (isNode(item) ? cloneWith(item, replace) : item));
		else copy[key] = isNode(value) ? cloneWith(value, replace) : value;
	}
	// `{ count }` reads `count`; once `count` is spelled `__s.count`, the property says so.
	if (copy.type === 'Property' && copy.shorthand === true && copy.value !== node.value)
		copy.shorthand = false;
	// Hermes runs async functions but not async arrows: one becomes an async function bound to the `this` around it.
	if (copy.type === 'ArrowFunctionExpression' && copy.async === true) {
		const body = copy.body as AnyNode;
		const fn = {
			type: 'FunctionExpression',
			id: null,
			async: true,
			generator: false,
			params: copy.params,
			body:
				body.type === 'BlockStatement'
					? body
					: {
							type: 'BlockStatement',
							body: [{ type: 'ReturnStatement', argument: body }],
						},
		};
		return {
			type: 'CallExpression',
			callee: {
				type: 'MemberExpression',
				object: fn,
				property: identifier('bind'),
				computed: false,
				optional: false,
			},
			arguments: [{ type: 'ThisExpression' }],
			optional: false,
		} as unknown as AnyNode;
	}
	return copy as AnyNode;
}

/** The node of the module's own analysis at the same place as a node of another parse of the same source. */
function semanticNodeOf(semantic: ModuleSemantics, node: AnyNode): AnyNode | undefined {
	const start = node.start as number;
	const at = semantic.nodeAt(start);
	if (!at) return undefined;
	for (const candidate of semantic.ancestors(at) as Iterable<AnyNode>)
		if (candidate.start === start && candidate.end === node.end && candidate.type === node.type)
			return candidate;
	return undefined;
}

/** Framework functions a phone's script runs, as the host service that stands in for each (`globalThis.__marklessHost.<name>`). */
const HOST_FUNCTIONS: Readonly<Record<string, ReadonlyArray<string>>> = {
	'@markless/router': ['navigate'],
};

/** The host service a framework import stands for in a script, or undefined when a script cannot run it. */
function hostFunctionOf(entry: {
	readonly kind: string;
	readonly specifier: string;
	readonly name?: string | null;
}): AnyNode | undefined {
	if (
		entry.kind !== 'named' ||
		!entry.name ||
		!HOST_FUNCTIONS[entry.specifier]?.includes(entry.name)
	)
		return undefined;
	return member(member(identifier('globalThis'), '__marklessHost'), entry.name);
}

/**
 * `location.current()`: a call on a `@markless/device` export that the device makes, as `[call, the export's stand-in]`.
 * Any other use of the export (a value such as `location.access`, a device object's maker) is left to the caller.
 */
function deviceCallOf(
	semantic: ModuleSemantics,
	node: AnyNode,
	entry: { readonly kind: string; readonly specifier: string; readonly name?: string | null },
): readonly [call: string, standIn: AnyNode] | undefined {
	if (entry.kind !== 'named' || entry.specifier !== DEVICE_MODULE || !entry.name) return undefined;
	const method = methodCalledOn(semantic, node);
	if (method === undefined) return undefined;
	const call = `${entry.name}.${method}`;
	if (!Object.hasOwn(DEVICE_CALLS, call) || 'object' in DEVICE_CALLS[call as keyof typeof DEVICE_CALLS])
		return undefined;
	return [
		call,
		member(member(member(identifier('globalThis'), '__marklessHost'), 'devices'), entry.name),
	];
}

/** `name.method(...)`: the method a reference is the object of a call to, when it is one. */
function methodCalledOn(semantic: ModuleSemantics, node: AnyNode): string | undefined {
	const read = semantic.parentOf(node as never) as AnyNode | null;
	const called = read && (semantic.parentOf(read as never) as AnyNode | null);
	if (
		read?.type !== 'MemberExpression' ||
		read.object !== node ||
		read.computed ||
		called?.type !== 'CallExpression' ||
		called.callee !== read
	)
		return undefined;
	return String((read.property as AnyNode).name);
}

/** The import record a binding comes from, when it is a value import. */
function importOf(semantic: ModuleSemantics, binding: Binding) {
	if (!binding.has(BindingFlags.Import) || binding.has(BindingFlags.TypeImport)) return undefined;
	return semantic.imports.find((entry) => entry.local?.id === binding.id);
}

/** The declarator, function or class that declares a binding, through destructuring patterns. */
function declaringNode(semantic: ModuleSemantics, binding: Binding): AnyNode | undefined {
	const name = binding.declarations[0] as AnyNode | undefined;
	if (!name) return undefined;
	for (
		let at = semantic.parentOf(name as never) as AnyNode | null;
		at;
		at = semantic.parentOf(at as never) as AnyNode | null
	) {
		if (
			at.type === 'VariableDeclarator' ||
			at.type === 'FunctionDeclaration' ||
			at.type === 'ClassDeclaration' ||
			at.type === 'ImportDeclaration'
		)
			return at;
		if (
			at.type !== 'ObjectPattern' &&
			at.type !== 'ArrayPattern' &&
			at.type !== 'Property' &&
			at.type !== 'AssignmentPattern' &&
			at.type !== 'RestElement'
		)
			return undefined;
	}
	return undefined;
}

/** Whether a declarator's value is a call to a framework API (`state(0)`, `computed(...)`, `element()`). */
function isFrameworkCall(semantic: ModuleSemantics, init: AnyNode | null | undefined): boolean {
	if (init?.type !== 'CallExpression') return false;
	let callee = init.callee as AnyNode | undefined;
	while (callee?.type === 'MemberExpression') callee = callee.object as AnyNode;
	if (callee?.type !== 'Identifier') return false;
	const binding = semantic.referenceOf(callee as never)?.binding;
	const entry = binding && importOf(semantic, binding);
	return !!entry && entry.specifier.startsWith(FRAMEWORK_PREFIX);
}

/** A component in TSRX: a function whose body is a template (`function App() @{ ... }`). */
const isComponent = (node: AnyNode | undefined): boolean =>
	node?.type === 'FunctionDeclaration' &&
	(node.body as AnyNode | undefined)?.type === 'JSXCodeBlock';

/** How the emitted code reaches each import binding: `__i[n].name`, or `__i[n]` for a namespace. */
function importSlots(semantic: ModuleSemantics) {
	const specifiers: string[] = [];
	const spans = new Map<string, AnyNode>();
	const slot = (specifier: string, node: AnyNode): number => {
		let index = specifiers.indexOf(specifier);
		if (index < 0) {
			index = specifiers.push(specifier) - 1;
			spans.set(specifier, node);
		}
		return index;
	};
	const byBinding = new Map<
		number,
		{ readonly index: number; readonly name: string | null; readonly specifier: string }
	>();
	for (const entry of semantic.imports) {
		if (entry.typeOnly || !entry.local || entry.specifier.startsWith(FRAMEWORK_PREFIX))
			continue;
		if (entry.kind !== 'named' && entry.kind !== 'namespace') continue;
		byBinding.set(entry.local.id, {
			index: slot(entry.specifier, entry.node as AnyNode),
			name: entry.kind === 'namespace' ? null : (entry.name ?? 'default'),
			specifier: entry.specifier,
		});
	}
	for (const entry of semantic.exports)
		if (!entry.typeOnly && entry.specifier && !entry.specifier.startsWith(FRAMEWORK_PREFIX))
			slot(entry.specifier, entry.node as AnyNode);
	const record = (binding: Binding) => byBinding.get(binding.id);
	const reach = (binding: Binding): AnyNode | undefined => {
		const found = byBinding.get(binding.id);
		if (!found) return undefined;
		const module = member(identifier('__i'), found.index);
		return found.name === null ? module : member(module, found.name);
	};
	return { specifiers, spans, reach, slot, record };
}

function globalOf(
	semantic: ModuleSemantics,
	reference: Reference,
	filename: string,
): SemanticScriptGlobal {
	const node = reference.node as unknown as AnyNode;
	const parent = semantic.parentOf(node as never) as AnyNode | null;
	const typeofOnly = parent?.type === 'UnaryExpression' && parent.operator === 'typeof';
	const property =
		GLOBAL_OBJECTS.has(reference.name) &&
		parent?.type === 'MemberExpression' &&
		parent.object === node &&
		!parent.computed &&
		typeof (parent.property as AnyNode | undefined)?.name === 'string'
			? String((parent.property as AnyNode).name)
			: undefined;
	return {
		name: reference.name,
		span: spanOf(node as never, filename),
		typeofOnly,
		...(property ? { property } : {}),
	};
}

/** Constructs type erasure cannot keep (`enum`, `namespace`), and markup, which no script runs. */
function unsupportedIn(
	node: AnyNode,
	filename: string,
	into: { construct: string; span: SourceSpan }[],
): void {
	if (String(node.type).startsWith('JSX')) {
		into.push({ construct: 'markup', span: spanOf(node as never, filename) });
		return;
	}
	const branch = takenBranch(node);
	if (branch) {
		if (branch.taken) unsupportedIn(branch.taken, filename, into);
		return;
	}
	if (clientEnvValue(node) !== undefined) return;
	const meta = metaPath(node);
	if (meta) {
		into.push({ construct: `\`${meta}\``, span: spanOf(node as never, filename) });
		return;
	}
	if (node.type === 'ImportExpression')
		into.push({ construct: 'a dynamic `import()`', span: spanOf(node as never, filename) });
	if (node.type === 'TSEnumDeclaration' || node.type === 'TSModuleDeclaration')
		into.push({
			construct: node.type === 'TSEnumDeclaration' ? 'an `enum`' : 'a `namespace`',
			span: spanOf(node as never, filename),
		});
	for (const value of Object.values(node)) {
		if (Array.isArray(value))
			for (const item of value) if (isNode(item)) unsupportedIn(item, filename, into);
		if (isNode(value)) unsupportedIn(value, filename, into);
	}
}

/**
 * A handler's or computed's JavaScript: the function itself, the component-local declarations it uses (helpers, consts)
 * before it, names of the component's state, props and rows read through `__s`, imports through `__i`.
 */
export function scriptFunctionOf(
	graphNode: AnyNode,
	semantic: ModuleSemantics,
	filename: string,
	/** A value read while rendering, not a function: the code returns a function that gives it. */
	asValue = false,
	/** A shared factory's method, whose parameters are its arguments rather than an event. */
	method = false,
): SemanticScriptFunction | undefined {
	const root = semanticNodeOf(semantic, graphNode);
	if (!root) return undefined;
	const rootScope = semantic.rootScope;
	const imports = importSlots(semantic);
	const parts: AnyNode[] = [root];
	const inlined = new Set<AnyNode>();
	const viaState = new Map<number, Binding>();
	const names = new Map<
		string,
		{ name: string; written: boolean; span: SourceSpan; calledOnly?: string[] }
	>();
	const framework: { name: string; source: string; span: SourceSpan }[] = [];
	const navigates: SourceSpan[] = [];
	const devices: SemanticScriptDeviceCall[] = [];
	const globals: SemanticScriptGlobal[] = [];
	const replaced = new Map<AnyNode, AnyNode>();
	const unsupported: { construct: string; span: SourceSpan }[] = [];
	const moduleNames = new Set<string>();
	const usedImports = new Map<string, { slot: number; name: string | null }>();
	for (let index = 0; index < parts.length; index++) {
		const part = parts[index]!;
		const dead = deadIn(part);
		for (const reference of semantic.references) {
			const node = reference.node as unknown as AnyNode;
			if (reference.inTypePosition || !within(node as never, part as never)) continue;
			if (dead.some((branch) => within(node as never, branch as never))) continue;
			const binding = reference.binding;
			if (!binding) {
				globals.push(globalOf(semantic, reference, filename));
				continue;
			}
			const declared = binding.declarations[0] as unknown as AnyNode | undefined;
			if (declared && parts.some((other) => within(declared as never, other as never)))
				continue;
			const entry = importOf(semantic, binding);
			const service = entry && hostFunctionOf(entry);
			if (service) {
				replaced.set(node, service);
				navigates.push(spanOf(node as never, filename));
				continue;
			}
			const device = entry && deviceCallOf(semantic, node, entry);
			if (device) {
				replaced.set(node, device[1]);
				devices.push({ call: device[0], span: spanOf(node as never, filename) });
				continue;
			}
			if (entry?.specifier.startsWith(FRAMEWORK_PREFIX)) {
				framework.push({
					name: reference.name,
					source: entry.specifier,
					span: spanOf(node as never, filename),
				});
				continue;
			}
			const imported = imports.reach(binding);
			if (imported) {
				replaced.set(node, imported);
				const slot = imports.record(binding)!;
				usedImports.set(`${slot.index}\0${slot.name}`, {
					slot: slot.index,
					name: slot.name,
				});
				continue;
			}
			const declaring = declaringNode(semantic, binding);
			const moduleLevel = binding.scope.id === rootScope.id;
			if (
				moduleLevel &&
				!isComponent(declaring) &&
				!(
					declaring?.type === 'VariableDeclarator' &&
					isFrameworkCall(semantic, declaring.init as AnyNode)
				)
			) {
				moduleNames.add(binding.name);
				continue;
			}
			const inline =
				!binding.has(BindingFlags.Parameter) &&
				!binding.has(BindingFlags.CatchVariable) &&
				!isComponent(declaring) &&
				(declaring?.type === 'FunctionDeclaration' ||
					declaring?.type === 'ClassDeclaration' ||
					(declaring?.type === 'VariableDeclarator' &&
						!!declaring.init &&
						!isFrameworkCall(semantic, declaring.init as AnyNode)));
			if (inline && declaring) {
				if (!inlined.has(declaring)) {
					inlined.add(declaring);
					parts.push(declaring);
				}
				continue;
			}
			viaState.set(binding.id, binding);
			replaced.set(node, stateName(binding.name));
			const known = names.get(binding.name);
			const method = methodCalledOn(semantic, node);
			const calledOnly =
				(known === undefined || known.calledOnly !== undefined) && method !== undefined
					? [...new Set([...(known?.calledOnly ?? []), method])]
					: undefined;
			names.set(binding.name, {
				name: binding.name,
				written: (known?.written ?? false) || reference.isWrite,
				span: known?.span ?? spanOf(node as never, filename),
				...(calledOnly ? { calledOnly } : {}),
			});
		}
	}
	const eventReads: { path: string[]; span: SourceSpan }[] = [];
	const [parameter] = (root.params as AnyNode[] | undefined) ?? [];
	const eventBinding =
		parameter?.type === 'Identifier' && !method ? semantic.bindingOf(parameter as never) : null;
	const deadInRoot = deadIn(root);
	for (const reference of eventBinding?.references ?? []) {
		let at = reference.node as unknown as AnyNode;
		if (deadInRoot.some((branch) => within(at as never, branch as never))) continue;
		const path: string[] = [];
		for (;;) {
			const parent = semantic.parentOf(at as never) as AnyNode | null;
			const property = parent?.property as AnyNode | undefined;
			if (
				parent?.type !== 'MemberExpression' ||
				parent.object !== at ||
				parent.computed ||
				typeof property?.name !== 'string'
			)
				break;
			path.push(property.name);
			at = parent;
		}
		eventReads.push({ path, span: spanOf(at as never, filename) });
	}
	const print = (node: AnyNode): string => {
		unsupportedIn(node, filename, unsupported);
		return generate(
			cloneWith(node, (candidate) => replaced.get(candidate)) as never,
			PRINT,
		).code.trim();
	};
	const declarations = [...inlined]
		.sort((a, b) => (a.start as number) - (b.start as number))
		.map((node) => {
			if (node.type !== 'VariableDeclarator') return print(node);
			const declaration = semantic.parentOf(node as never) as AnyNode | null;
			const kind =
				declaration?.type === 'VariableDeclaration' ? String(declaration.kind) : 'const';
			return print({
				type: 'VariableDeclaration',
				kind,
				declarations: [node],
			} as unknown as AnyNode);
		});
	return {
		code: [
			...declarations,
			asValue ? `return function () {\nreturn (${print(root)});\n};` : `return (${print(root)});`,
		].join('\n'),
		names: [...names.values()],
		module: [...moduleNames],
		imports: [...usedImports.values()],
		...(eventBinding ? { event: eventReads } : {}),
		globals,
		framework,
		navigates,
		devices,
		span: spanOf(root as never, filename),
		unsupported,
	};
}

/**
 * The module's top-level code as a script module, one statement at a time, so a build keeps only what its script
 * functions reach. Components and top-level framework state are left out (a script reaches state through `__s`);
 * imports become `__i[n]`; each export is a getter on `exports`, so a cycle sees live values as ES modules do.
 */
export function scriptModuleOf(semantic: ModuleSemantics, filename: string): SemanticScriptModule {
	const imports = importSlots(semantic);
	const rootScope = semantic.rootScope;
	const droppedBindings = new Set<number>();
	for (const binding of semantic.bindings) {
		if (binding.scope.id !== rootScope.id) continue;
		const declaring = declaringNode(semantic, binding);
		if (
			isComponent(declaring) ||
			(declaring?.type === 'VariableDeclarator' &&
				isFrameworkCall(semantic, declaring.init as AnyNode))
		)
			droppedBindings.add(binding.id);
	}
	const statements: SemanticScriptStatement[] = [];
	const exports: SemanticScriptExport[] = [];
	const describe = (
		node: AnyNode,
		declares: string[],
		effect: boolean,
		range: AnyNode = node,
	): void => {
		const replaced = new Map<AnyNode, AnyNode>();
		const uses = new Set<string>();
		const used = new Map<string, { slot: number; name: string | null }>();
		const globals: SemanticScriptGlobal[] = [];
		const dropped: { name: string; span: SourceSpan }[] = [];
		const framework: { name: string; source: string; span: SourceSpan }[] = [];
		const navigates: SourceSpan[] = [];
		const devices: SemanticScriptDeviceCall[] = [];
		const unsupported: { construct: string; span: SourceSpan }[] = [];
		const dead = deadIn(node);
		for (const reference of semantic.references) {
			const at = reference.node as unknown as AnyNode;
			if (reference.inTypePosition || !within(at as never, range as never)) continue;
			if (dead.some((branch) => within(at as never, branch as never))) continue;
			const binding = reference.binding;
			if (!binding) {
				globals.push(globalOf(semantic, reference, filename));
				continue;
			}
			const entry = importOf(semantic, binding);
			const service = entry && hostFunctionOf(entry);
			if (service) {
				replaced.set(at, service);
				navigates.push(spanOf(at as never, filename));
				continue;
			}
			const device = entry && deviceCallOf(semantic, at, entry);
			if (device) {
				replaced.set(at, device[1]);
				devices.push({ call: device[0], span: spanOf(at as never, filename) });
				continue;
			}
			if (entry?.specifier.startsWith(FRAMEWORK_PREFIX)) {
				framework.push({
					name: reference.name,
					source: entry.specifier,
					span: spanOf(at as never, filename),
				});
				continue;
			}
			const imported = imports.reach(binding);
			if (imported) {
				replaced.set(at, imported);
				const slot = imports.record(binding)!;
				used.set(`${slot.index}\0${slot.name}`, { slot: slot.index, name: slot.name });
			} else if (droppedBindings.has(binding.id))
				dropped.push({ name: reference.name, span: spanOf(at as never, filename) });
			else if (binding.scope.id === rootScope.id && !declares.includes(binding.name))
				uses.add(binding.name);
		}
		unsupportedIn(node, filename, unsupported);
		statements.push({
			code: generate(
				cloneWith(node, (candidate) => replaced.get(candidate)) as never,
				PRINT,
			).code.trim(),
			declares,
			uses: [...uses],
			imports: [...used.values()],
			effect,
			globals,
			dropped,
			framework,
			navigates,
			devices,
			unsupported,
		});
	};
	const declaredNames = (node: AnyNode): string[] =>
		semantic.bindings
			.filter(
				(binding) =>
					binding.scope.id === rootScope.id &&
					binding.declarations.some((name) => within(name as never, node as never)),
			)
			.map((binding) => binding.name);
	for (const statement of (semantic.ast as unknown as { body: AnyNode[] }).body) {
		if (statement.type === 'ImportDeclaration') continue;
		if (
			statement.type === 'ExportAllDeclaration' ||
			(statement.type === 'ExportNamedDeclaration' && statement.source)
		)
			continue;
		if (statement.type === 'ExportNamedDeclaration' && !statement.declaration) continue;
		const declaration =
			statement.type === 'ExportNamedDeclaration' ||
			statement.type === 'ExportDefaultDeclaration'
				? (statement.declaration as AnyNode)
				: statement;
		if (isComponent(declaration) || String(declaration.type).startsWith('TS')) continue;
		if (declaration.type === 'VariableDeclaration') {
			for (const declarator of declaration.declarations as AnyNode[]) {
				if (isFrameworkCall(semantic, declarator.init as AnyNode | undefined)) continue;
				describe(
					{ ...declaration, declarations: [declarator] } as AnyNode,
					declaredNames(declarator),
					false,
				);
			}
			continue;
		}
		if (
			statement.type === 'ExportDefaultDeclaration' &&
			!(String(declaration.type).endsWith('Declaration') && declaration.id)
		) {
			const value =
				declaration.type === 'FunctionDeclaration' ||
				declaration.type === 'ClassDeclaration'
					? {
							...declaration,
							type:
								declaration.type === 'FunctionDeclaration'
									? 'FunctionExpression'
									: 'ClassExpression',
						}
					: declaration;
			describe(
				{
					type: 'VariableDeclaration',
					kind: 'var',
					declarations: [
						{ type: 'VariableDeclarator', id: identifier('__default'), init: value },
					],
				} as unknown as AnyNode,
				['__default'],
				false,
				declaration,
			);
			exports.push({ name: 'default', local: '__default' });
			continue;
		}
		const declares = declaredNames(declaration);
		describe(declaration, declares, declares.length === 0);
	}
	for (const entry of semantic.exports) {
		if (entry.typeOnly || entry.specifier?.startsWith(FRAMEWORK_PREFIX)) continue;
		if (entry.kind === 'named') {
			if (
				!entry.local ||
				droppedBindings.has(entry.local.id) ||
				!entry.local.has(BindingFlags.ValueSpace)
			)
				continue;
			if (
				entry.name === 'default' &&
				exports.some((known) => 'name' in known && known.name === 'default')
			)
				continue;
			exports.push({ name: entry.name ?? 'default', local: entry.local.name });
		} else if (entry.kind === 'reExport' && entry.specifier)
			exports.push({
				name: entry.name ?? 'default',
				slot: imports.slot(entry.specifier, entry.node as AnyNode),
				from: entry.fromName ?? 'default',
			});
		else if (entry.kind === 'namespace' && entry.specifier)
			exports.push({
				name: entry.name ?? '',
				slot: imports.slot(entry.specifier, entry.node as AnyNode),
				from: null,
			});
		else if (entry.kind === 'star' && entry.specifier)
			exports.push({ star: imports.slot(entry.specifier, entry.node as AnyNode) });
	}
	const flags = semantic.moduleFlags;
	return {
		imports: imports.specifiers.map((specifier) => ({
			specifier,
			span: spanOf(imports.spans.get(specifier) as never, filename),
		})),
		statements,
		exports,
		...(flags.usesRequire || flags.usesModule || flags.usesExports
			? { commonjs: true as const }
			: {}),
	};
}

/** A value a template reads (a text run, an attribute, a `@for` list) as a script that gives it. */
export const scriptValueOf = (node: AnyNode, semantic: ModuleSemantics, filename: string) =>
	scriptFunctionOf(node, semantic, filename, true);

/** The outermost node written exactly over `span`. */
function nodeOver(semantic: ModuleSemantics, span: { readonly start: number; readonly end: number }): AnyNode | undefined {
	const at = semantic.nodeAt(span.start);
	let found: AnyNode | undefined;
	if (!at) return undefined;
	for (const node of semantic.ancestors(at) as Iterable<AnyNode>) {
		if (node.start === span.start && node.end === span.end && node.type !== 'JSXExpressionContainer') found = node;
		if ((node.start as number) < span.start || (node.end as number) > span.end) break;
	}
	return found;
}

/**
 * A native build's script facts for one module, from the module's own analysis: what the native pass asks for, found
 * by the places the semantic graph records. The web build never loads this.
 */
export function scriptFactsOf(source: string, filename: string) {
	const semantic = moduleSemantics(source, filename);
	let module: SemanticScriptModule | undefined;
	return {
		/** A handler written at `span`: an inline function, or the name of one. */
		handler: (span: SourceSpan): SemanticScriptFunction | undefined => {
			const node = nodeOver(semantic, span);
			return node && scriptFunctionOf(node, semantic, filename);
		},
		/** A shared factory's method written at `span` (its property). */
		method: (span: SourceSpan): SemanticScriptFunction | undefined => {
			const node = nodeOver(semantic, span);
			const fn = node?.type === 'Property' ? (node.value as AnyNode | undefined) : undefined;
			return fn && scriptFunctionOf(fn, semantic, filename, false, true);
		},
		/** A value the template reads, written at `span`. */
		value: (span: SourceSpan): SemanticScriptFunction | undefined => {
			const node = nodeOver(semantic, span);
			return node && scriptFunctionOf(node, semantic, filename, true);
		},
		/** The list a `@for` iterates, found from where its row element is written. */
		forList: (rowSpan: SourceSpan): SemanticScriptFunction | undefined => {
			const at = semantic.nodeAt(rowSpan.start);
			if (!at) return undefined;
			for (const node of semantic.ancestors(at) as Iterable<AnyNode>)
				if (node.type === 'JSXForExpression') return scriptFunctionOf(node.right as AnyNode, semantic, filename, true);
			return undefined;
		},
		/** The function of `computed(...)` bound to `name` in `component` (module level when there is none). */
		computed: (component: string | undefined, name: string): SemanticScriptFunction | undefined => {
			for (const binding of semantic.bindings) {
				if (binding.name !== name) continue;
				const declaring = declaringNode(semantic, binding);
				if (declaring?.type !== 'VariableDeclarator' || !isFrameworkCall(semantic, declaring.init as AnyNode)) continue;
				let owner: string | undefined;
				for (const node of semantic.ancestors(declaring as never) as Iterable<AnyNode>)
					if (isComponent(node)) {
						owner = String((node.id as AnyNode | undefined)?.name);
						break;
					}
				if ((owner ?? '') !== (component ?? '')) continue;
				const [fn] = ((declaring.init as AnyNode).arguments as AnyNode[] | undefined) ?? [];
				return fn && scriptFunctionOf(fn, semantic, filename);
			}
			return undefined;
		},
		/**
		 * A call to `name`, a function this module declares or imports from app code, with the arguments the caller passes as
		 * the array `__s.args`; none for a component, framework state or a framework import.
		 */
		moduleCall: (name: string): SemanticScriptFunction | undefined => {
			const binding = semantic.bindings.find(
				(candidate) => candidate.name === name && candidate.scope.id === semantic.rootScope.id,
			);
			if (!binding) return undefined;
			const imports = importSlots(semantic);
			const imported = imports.record(binding);
			const declaring = imported
				? (binding.declarations[0] as AnyNode | undefined)
				: !importOf(semantic, binding) && declaringNode(semantic, binding);
			if (
				!declaring ||
				isComponent(declaring) ||
				(declaring.type === 'VariableDeclarator' &&
					isFrameworkCall(semantic, declaring.init as AnyNode))
			)
				return undefined;
			const callee = imported ? generate(imports.reach(binding) as never, PRINT).code.trim() : name;
			const span = spanOf(declaring as never, filename);
			return {
				code: `return function () {\nreturn ${callee}.apply(undefined, __s.args);\n};`,
				names: [{ name: 'args', written: false, span }],
				module: imported ? [] : [name],
				imports: imported ? [{ slot: imported.index, name: imported.name }] : [],
				globals: [],
				framework: [],
				navigates: [],
				devices: [],
				span,
				unsupported: [],
			};
		},
		module: (): SemanticScriptModule => (module ??= scriptModuleOf(semantic, filename)),
	};
}

export type ScriptFacts = ReturnType<typeof scriptFactsOf>;
