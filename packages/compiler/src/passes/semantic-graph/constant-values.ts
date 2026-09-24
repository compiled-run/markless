import {
	asNodes,
	childNodes,
	getIdentifierName,
	unwrapTypeAssertion,
	type AnyNode,
} from '../../ast/nodes.ts';
import { parseModule } from '../../js-ast.ts';

/**
 * Build-time evaluation of plain data: literals, object and array literals, and
 * static member or index reads of other constants. Every value this produces is
 * JSON data (plus a top-level `undefined` from a missing property), so it can be
 * written into a module or the page as-is.
 */
export type ConstantValue = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

const NOT_CONSTANT: ConstantValue = { ok: false };

export type ConstantNameResolver = (identifier: AnyNode) => ConstantValue;

export function evaluateConstantExpression(
	rawNode: AnyNode | undefined,
	resolveName: ConstantNameResolver,
): ConstantValue {
	const node = unwrapTypeAssertion(rawNode);
	if (!node) return NOT_CONSTANT;
	switch (node.type) {
		case 'ChainExpression':
			return evaluateConstantExpression(node.expression as AnyNode | undefined, resolveName);
		case 'Literal':
			return literalValue(node);
		case 'TemplateLiteral': {
			if (asNodes(node.expressions).length > 0) return NOT_CONSTANT;
			const [quasi] = asNodes(node.quasis);
			const cooked = (quasi?.value as { cooked?: unknown } | undefined)?.cooked;
			return typeof cooked === 'string' ? { ok: true, value: cooked } : NOT_CONSTANT;
		}
		case 'Identifier':
			if (getIdentifierName(node) === 'undefined') return { ok: true, value: undefined };
			return resolveName(node);
		case 'UnaryExpression': {
			const argument = evaluateConstantExpression(
				node.argument as AnyNode | undefined,
				resolveName,
			);
			if (!argument.ok) return NOT_CONSTANT;
			if (node.operator === '!') return { ok: true, value: !argument.value };
			if (typeof argument.value !== 'number') return NOT_CONSTANT;
			if (node.operator === '-') return { ok: true, value: -argument.value };
			if (node.operator === '+') return { ok: true, value: argument.value };
			return NOT_CONSTANT;
		}
		case 'ArrayExpression':
			return arrayValue(node, resolveName);
		case 'ObjectExpression':
			return objectValue(node, resolveName);
		case 'MemberExpression':
			return memberValue(node, resolveName);
		default:
			return NOT_CONSTANT;
	}
}

function literalValue(node: AnyNode): ConstantValue {
	if (node.regex !== undefined || node.bigint !== undefined) return NOT_CONSTANT;
	const value = node.value;
	if (typeof value === 'number')
		return Number.isFinite(value) ? { ok: true, value } : NOT_CONSTANT;
	if (typeof value === 'string' || typeof value === 'boolean' || value === null) {
		return { ok: true, value };
	}
	return NOT_CONSTANT;
}

function arrayValue(node: AnyNode, resolveName: ConstantNameResolver): ConstantValue {
	const values: unknown[] = [];
	for (const element of node.elements as ReadonlyArray<AnyNode | null>) {
		if (!element) return NOT_CONSTANT;
		if (element.type === 'SpreadElement') {
			const spread = evaluateConstantExpression(
				element.argument as AnyNode | undefined,
				resolveName,
			);
			if (!spread.ok || !Array.isArray(spread.value)) return NOT_CONSTANT;
			values.push(...(spread.value as unknown[]));
			continue;
		}
		const value = evaluateConstantExpression(element, resolveName);
		// JSON has no undefined array slot; the page would read null instead.
		if (!value.ok || value.value === undefined) return NOT_CONSTANT;
		values.push(value.value);
	}
	return { ok: true, value: values };
}

function objectValue(node: AnyNode, resolveName: ConstantNameResolver): ConstantValue {
	const output: Record<string, unknown> = {};
	for (const property of asNodes(node.properties)) {
		if (property.type === 'SpreadElement') {
			const spread = evaluateConstantExpression(
				property.argument as AnyNode | undefined,
				resolveName,
			);
			if (!spread.ok || !isPlainObject(spread.value)) return NOT_CONSTANT;
			for (const [key, value] of Object.entries(spread.value)) setOwn(output, key, value);
			continue;
		}
		if (property.type !== 'Property' || property.kind !== 'init' || property.method === true) {
			return NOT_CONSTANT;
		}
		const key = propertyKey(property, resolveName);
		if (key === null || key === '__proto__') return NOT_CONSTANT;
		const value = evaluateConstantExpression(
			property.value as AnyNode | undefined,
			resolveName,
		);
		if (!value.ok || value.value === undefined) return NOT_CONSTANT;
		setOwn(output, key, value.value);
	}
	return { ok: true, value: output };
}

function propertyKey(property: AnyNode, resolveName: ConstantNameResolver): string | null {
	const key = property.key as AnyNode | undefined;
	if (!key) return null;
	if (property.computed === true) {
		const computed = evaluateConstantExpression(key, resolveName);
		return computed.ok &&
			(typeof computed.value === 'string' || typeof computed.value === 'number')
			? String(computed.value)
			: null;
	}
	if (key.type === 'Identifier') return getIdentifierName(key);
	if (
		key.type === 'Literal' &&
		(typeof key.value === 'string' || typeof key.value === 'number')
	) {
		return String(key.value);
	}
	return null;
}

function memberValue(node: AnyNode, resolveName: ConstantNameResolver): ConstantValue {
	const object = evaluateConstantExpression(node.object as AnyNode | undefined, resolveName);
	if (!object.ok) return NOT_CONSTANT;
	const property = node.property as AnyNode | undefined;
	let key: string | number | null = null;
	if (node.computed === true) {
		const computed = evaluateConstantExpression(property, resolveName);
		if (
			computed.ok &&
			(typeof computed.value === 'string' || typeof computed.value === 'number')
		)
			key = computed.value;
	} else if (property?.type === 'Identifier') {
		key = getIdentifierName(property);
	}
	if (key === null) return NOT_CONSTANT;
	const holder = object.value;
	if (holder === null || holder === undefined) {
		return node.optional === true ? { ok: true, value: undefined } : NOT_CONSTANT;
	}
	if (Array.isArray(holder)) {
		if (key === 'length') return { ok: true, value: holder.length };
		const index = typeof key === 'number' ? key : /^(0|[1-9]\d*)$/.test(key) ? Number(key) : -1;
		if (!Number.isInteger(index) || index < 0) return NOT_CONSTANT;
		return { ok: true, value: holder[index] };
	}
	if (isPlainObject(holder)) {
		const name = String(key);
		return { ok: true, value: Object.hasOwn(holder, name) ? holder[name] : undefined };
	}
	if (typeof holder === 'string' && key === 'length') return { ok: true, value: holder.length };
	return NOT_CONSTANT;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function setOwn(target: Record<string, unknown>, key: string, value: unknown): void {
	Object.defineProperty(target, key, {
		value,
		enumerable: true,
		writable: true,
		configurable: true,
	});
}

const MUTATING_METHODS = new Set([
	'push',
	'pop',
	'shift',
	'unshift',
	'splice',
	'sort',
	'reverse',
	'fill',
	'copyWithin',
	'set',
	'add',
	'delete',
	'clear',
]);

const MUTATING_STATIC_CALLS = new Set([
	'Object.assign',
	'Object.defineProperty',
	'Object.defineProperties',
	'Object.setPrototypeOf',
	'Reflect.set',
	'Reflect.defineProperty',
	'Reflect.deleteProperty',
	'Reflect.setPrototypeOf',
]);

/**
 * Names whose value some statement in this module writes through: `X.a = ...`,
 * `X[0].b++`, `delete X.c`, `X.push(...)`, `Object.assign(X, ...)`. Matched by
 * name, so a shadowing local only ever makes the answer more cautious.
 */
export function namesMutatedInModule(ast: AnyNode): ReadonlySet<string> {
	const mutated = new Set<string>();
	const visit = (node: AnyNode): void => {
		if (node.type === 'AssignmentExpression') {
			const root = memberChainRoot(node.left as AnyNode | undefined);
			if (root) mutated.add(root);
		} else if (node.type === 'UpdateExpression') {
			const root = memberChainRoot(node.argument as AnyNode | undefined);
			if (root) mutated.add(root);
		} else if (node.type === 'UnaryExpression' && node.operator === 'delete') {
			const root = memberChainRoot(node.argument as AnyNode | undefined);
			if (root) mutated.add(root);
		} else if (node.type === 'CallExpression') {
			const callee = unwrapTypeAssertion(node.callee as AnyNode | undefined);
			if (callee?.type === 'MemberExpression') {
				const method =
					callee.computed === true ? null : getIdentifierName(callee.property as AnyNode);
				const calleeName = staticCalleeName(callee);
				if (method && MUTATING_METHODS.has(method)) {
					const root = rootIdentifierName(callee.object as AnyNode | undefined);
					if (root) mutated.add(root);
				}
				if (calleeName && MUTATING_STATIC_CALLS.has(calleeName)) {
					const root = rootIdentifierName(asNodes(node.arguments)[0]);
					if (root) mutated.add(root);
				}
			}
		}
		for (const child of childNodes(node)) visit(child);
	};
	visit(ast);
	return mutated;
}

// Only a write THROUGH the name counts; `const` already forbids rebinding it.
function memberChainRoot(node: AnyNode | undefined): string | null {
	const target = unwrapTypeAssertion(node);
	if (target?.type !== 'MemberExpression') return null;
	return rootIdentifierName(target);
}

function rootIdentifierName(node: AnyNode | undefined): string | null {
	let current = unwrapTypeAssertion(node);
	while (current) {
		if (current.type === 'Identifier') return getIdentifierName(current);
		if (current.type === 'MemberExpression' || current.type === 'ChainExpression') {
			current = unwrapTypeAssertion(
				(current.type === 'ChainExpression'
					? current.expression
					: current.object) as AnyNode,
			);
			continue;
		}
		if (current.type === 'CallExpression') {
			const callee = unwrapTypeAssertion(current.callee as AnyNode | undefined);
			current = callee?.type === 'MemberExpression' ? (callee.object as AnyNode) : undefined;
			continue;
		}
		return null;
	}
	return null;
}

function staticCalleeName(callee: AnyNode): string | null {
	const object = callee.object as AnyNode | undefined;
	if (object?.type !== 'Identifier' || callee.computed === true) return null;
	const holder = getIdentifierName(object);
	const method = getIdentifierName(callee.property as AnyNode | undefined);
	return holder && method ? `${holder}.${method}` : null;
}

/**
 * The exported `const` values of a plain script module that are plain data and
 * that no statement in the module writes through. Anything else - a call, a
 * reference to an import, a value the module mutates - is left out, and a
 * component prop that reads it keeps its refusal.
 */
export function evaluateModuleConstants(input: {
	readonly filename: string;
	readonly source: string;
}): Readonly<Record<string, unknown>> {
	let ast: AnyNode;
	try {
		ast = parseModule(input.source, input.filename) as unknown as AnyNode;
	} catch {
		return {};
	}
	const initializers = new Map<string, AnyNode | undefined>();
	const exportedLocals = new Map<string, string>();
	for (const statement of asNodes(ast.body)) {
		const exported = statement.type === 'ExportNamedDeclaration';
		const declaration = exported ? (statement.declaration as AnyNode | undefined) : statement;
		if (declaration?.type === 'VariableDeclaration' && declaration.kind === 'const') {
			for (const declarator of asNodes(declaration.declarations)) {
				const name = getIdentifierName(declarator.id as AnyNode | undefined);
				if (!name) continue;
				initializers.set(name, declarator.init as AnyNode | undefined);
				if (exported) exportedLocals.set(name, name);
			}
		}
		if (exported && !statement.source && statement.exportKind !== 'type') {
			for (const specifier of asNodes(statement.specifiers)) {
				if (specifier.exportKind === 'type') continue;
				const local = getIdentifierName(specifier.local as AnyNode | undefined);
				const exportedName = specifierName(specifier.exported as AnyNode | undefined);
				if (local && exportedName) exportedLocals.set(exportedName, local);
			}
		}
		if (statement.type === 'ExportDefaultDeclaration') {
			const local = getIdentifierName(statement.declaration as AnyNode | undefined);
			if (local) exportedLocals.set('default', local);
		}
	}
	const mutated = namesMutatedInModule(ast);
	const values = new Map<string, ConstantValue>();
	const evaluateLocal = (name: string, visiting: ReadonlySet<string>): ConstantValue => {
		const known = values.get(name);
		if (known) return known;
		if (visiting.has(name) || mutated.has(name) || !initializers.has(name)) return NOT_CONSTANT;
		const nextVisiting = new Set(visiting).add(name);
		const value = evaluateConstantExpression(initializers.get(name), (identifier) => {
			const referenced = getIdentifierName(identifier);
			return referenced ? evaluateLocal(referenced, nextVisiting) : NOT_CONSTANT;
		});
		values.set(name, value);
		return value;
	};
	const constants: Record<string, unknown> = {};
	for (const [exportedName, local] of exportedLocals) {
		const value = evaluateLocal(local, new Set());
		if (value.ok) setOwn(constants, exportedName, value.value);
	}
	return constants;
}

function specifierName(node: AnyNode | undefined): string | null {
	if (!node) return null;
	if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
	return getIdentifierName(node);
}
