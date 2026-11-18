import type { AnyNode } from '../../ast/nodes.ts';
import { asNodes } from '../../ast/nodes.ts';
import type {
	NativeFactCollectors,
	SemanticComponentNativeFacts,
	SemanticExpression,
	SemanticHandlerStatement,
} from '../../artifacts.ts';

const UNARY = new Set(['!', '-', '+', 'typeof']);
const BINARY = new Set(['+', '-', '*', '/', '%', '===', '!==', '<', '<=', '>', '>=']);
const LOGICAL = new Set(['&&', '||', '??']);
const COMPOUND = new Set(['+=', '-=', '*=', '/=', '%=']);
/** Calls with exact JavaScript meaning that a native host implements; any other call needs a script engine. */
const BUILTINS = new Set(['String', 'Number', 'Boolean', 'Math.abs', 'Math.floor', 'Math.max', 'Math.min', 'Math.round']);
/** Array and string methods with exact JavaScript meaning that return a new value and change nothing. */
const METHODS = new Set([
	'filter', 'map', 'find', 'findIndex', 'some', 'every', 'includes', 'indexOf', 'join', 'concat', 'slice',
	'reverse', 'toReversed', 'toUpperCase', 'toLowerCase', 'trim',
]);

const lambdaOf = (node: AnyNode): SemanticExpression => {
	const parameters = asNodes(node.params);
	if (node.async || parameters.some((parameter) => parameter.type !== 'Identifier'))
		return unsupported('a function with a pattern or async parameters');
	const body = node.body as AnyNode | undefined;
	if (!body || body.type === 'BlockStatement') return unsupported('a function with a block body');
	return { kind: 'lambda', parameters: parameters.map((parameter) => String(parameter.name)), body: expressionTreeOf(body) };
};

const unsupported = (construct: string): SemanticExpression => ({ kind: 'unsupported', construct });

function calleeName(node: AnyNode | undefined): string | null {
	if (node?.type === 'Identifier' && typeof node.name === 'string') return node.name;
	if (node?.type === 'MemberExpression' && !node.computed) {
		const object = calleeName(node.object as AnyNode | undefined);
		const property = (node.property as AnyNode | undefined)?.name;
		return object && typeof property === 'string' ? `${object}.${property}` : null;
	}
	return null;
}

/** A template value, test or assigned value as a tree a native host evaluates; names are the component's bindings. */
export function expressionTreeOf(node: AnyNode | undefined): SemanticExpression {
	if (!node) return unsupported('a missing expression');
	switch (node.type) {
		case 'ParenthesizedExpression':
		case 'JSXExpressionContainer':
		case 'ChainExpression':
		case 'TSAsExpression':
		case 'TSSatisfiesExpression':
		case 'TSNonNullExpression':
		case 'TSTypeAssertion':
			return expressionTreeOf(node.expression as AnyNode | undefined);
		case 'Identifier':
			if (node.name === 'undefined') return { kind: 'literal', value: null };
			return typeof node.name === 'string' ? { kind: 'read', name: node.name } : unsupported('a name');
		case 'Literal':
			return typeof node.value === 'string' ||
				typeof node.value === 'boolean' ||
				typeof node.value === 'number' ||
				node.value === null
				? { kind: 'literal', value: node.value as string | number | boolean | null }
				: unsupported('a regular expression or bigint literal');
		case 'TemplateLiteral': {
			const quasis = asNodes(node.quasis).map((quasi) => {
				const value = quasi.value as { cooked?: string } | undefined;
				return value?.cooked ?? '';
			});
			const expressions = asNodes(node.expressions).map(expressionTreeOf);
			return {
				kind: 'template',
				parts: quasis.flatMap((text, index) =>
					index < expressions.length ? [text, expressions[index]!] : [text],
				),
			};
		}
		case 'UnaryExpression':
			return typeof node.operator === 'string' && UNARY.has(node.operator)
				? { kind: 'unary', operator: node.operator as '!' | '-' | '+' | 'typeof', value: expressionTreeOf(node.argument as AnyNode) }
				: unsupported(`the \`${String(node.operator)}\` operator`);
		case 'BinaryExpression':
			return typeof node.operator === 'string' && BINARY.has(node.operator)
				? {
						kind: 'binary',
						operator: node.operator as Extract<SemanticExpression, { kind: 'binary' }>['operator'],
						left: expressionTreeOf(node.left as AnyNode),
						right: expressionTreeOf(node.right as AnyNode),
					}
				: unsupported(`the \`${String(node.operator)}\` operator`);
		case 'LogicalExpression':
			return typeof node.operator === 'string' && LOGICAL.has(node.operator)
				? {
						kind: 'logical',
						operator: node.operator as '&&' | '||' | '??',
						left: expressionTreeOf(node.left as AnyNode),
						right: expressionTreeOf(node.right as AnyNode),
					}
				: unsupported(`the \`${String(node.operator)}\` operator`);
		case 'ConditionalExpression':
			return {
				kind: 'conditional',
				test: expressionTreeOf(node.test as AnyNode),
				consequent: expressionTreeOf(node.consequent as AnyNode),
				alternate: expressionTreeOf(node.alternate as AnyNode),
			};
		case 'MemberExpression': {
			const key = node.property as AnyNode | undefined;
			const property = node.computed
				? key?.type === 'Literal' && typeof key.value === 'number' && Number.isInteger(key.value) && key.value >= 0
					? String(key.value)
					: undefined
				: key?.name;
			return typeof property === 'string'
				? { kind: 'member', object: expressionTreeOf(node.object as AnyNode), property }
				: unsupported('a computed member read');
		}
		case 'CallExpression': {
			const callee = node.callee as AnyNode | undefined;
			const method = callee?.type === 'MemberExpression' && !callee.computed ? (callee.property as AnyNode | undefined)?.name : undefined;
			if (typeof method === 'string' && METHODS.has(method) && !BUILTINS.has(calleeName(callee) ?? '')) {
				return {
					kind: 'method',
					method,
					object: expressionTreeOf(callee!.object as AnyNode),
					arguments: asNodes(node.arguments).map((argument) =>
						argument.type === 'ArrowFunctionExpression' ? lambdaOf(argument) : expressionTreeOf(argument),
					),
				};
			}
			const name = calleeName(callee);
			if (name && BUILTINS.has(name))
				return { kind: 'call', callee: name, arguments: asNodes(node.arguments).map(expressionTreeOf) };
			if (callee?.type === 'Identifier' && name && !asNodes(node.arguments).some((argument) => argument.type === 'SpreadElement'))
				return { kind: 'apply', callee: name, arguments: asNodes(node.arguments).map(expressionTreeOf) };
			return unsupported(`a call to \`${name ?? 'a computed function'}\``);
		}
		case 'AwaitExpression':
			return unsupported('`await`');
		case 'ArrowFunctionExpression':
		case 'FunctionExpression':
			return unsupported('a function value');
		case 'ArrayExpression':
			return {
				kind: 'array',
				items: asNodes(node.elements).map((element) =>
					element?.type === 'SpreadElement'
						? { spread: true, value: expressionTreeOf(element.argument as AnyNode) }
						: { spread: false, value: expressionTreeOf(element ?? undefined) },
				),
			};
		case 'ObjectExpression': {
			const entries: (readonly [string, SemanticExpression])[] = [];
			for (const property of asNodes(node.properties)) {
				const key = property.key as AnyNode | undefined;
				const name = key?.type === 'Identifier' ? key.name : key?.type === 'Literal' ? key.value : undefined;
				if (property.type !== 'Property' || property.computed || property.kind !== 'init' || typeof name !== 'string')
					return unsupported('an object with a spread, computed key or method');
				entries.push([name, expressionTreeOf(property.value as AnyNode)]);
			}
			return { kind: 'object', entries };
		}
		default:
			return unsupported(`a ${String(node.type)}`);
	}
}

/** `a.b.c` as its root name and member path, or null for anything else. */
function memberPath(
	node: AnyNode | undefined,
): { readonly name: string; readonly path: string[] } | null {
	if (node?.type === 'Identifier' && typeof node.name === 'string')
		return { name: node.name, path: [] };
	if (node?.type === 'MemberExpression' && !node.computed) {
		const object = memberPath(node.object as AnyNode | undefined);
		const property = (node.property as AnyNode | undefined)?.name;
		return object && typeof property === 'string'
			? { name: object.name, path: [...object.path, property] }
			: null;
	}
	return null;
}

const assignTo = (
	target: { readonly name: string; readonly path: ReadonlyArray<string> },
	value: SemanticExpression,
): SemanticHandlerStatement => ({
	kind: 'assign',
	target: target.name,
	...(target.path.length > 0 ? { path: target.path } : {}),
	value,
});

const readOf = (target: {
	readonly name: string;
	readonly path: ReadonlyArray<string>;
}): SemanticExpression =>
	target.path.reduce<SemanticExpression>(
		(object, property) => ({ kind: 'member', object, property }),
		{
			kind: 'read',
			name: target.name,
		},
	);

const statementOf = (expression: AnyNode | null): SemanticHandlerStatement => {
	if (!expression)
		return { kind: 'unsupported', construct: 'a statement other than an expression' };
	if (expression.type === 'ParenthesizedExpression' || expression.type === 'ChainExpression')
		return statementOf((expression.expression as AnyNode | undefined) ?? null);
	if (expression.type === 'CallExpression') {
		const callee = memberPath(expression.callee as AnyNode | undefined);
		if (callee && !BUILTINS.has([callee.name, ...callee.path].join('.'))) {
			const args = asNodes(expression.arguments).map(expressionTreeOf);
			return {
				kind: 'invoke',
				name: callee.name,
				...(callee.path.length > 0 ? { path: callee.path } : {}),
				...(args.length > 0 ? { arguments: args } : {}),
				...(expression.optional === true ? { optional: true as const } : {}),
			};
		}
	}
	if (expression.type === 'UpdateExpression') {
		const target = memberPath(expression.argument as AnyNode | undefined);
		if (!target)
			return {
				kind: 'unsupported',
				construct: 'an update of something other than a name or member',
			};
		return assignTo(target, {
			kind: 'binary',
			operator: expression.operator === '--' ? '-' : '+',
			left: { kind: 'unary', operator: '+', value: readOf(target) },
			right: { kind: 'literal', value: 1 },
		});
	}
	if (expression.type === 'AssignmentExpression') {
		const target = memberPath(expression.left as AnyNode | undefined);
		if (!target)
			return {
				kind: 'unsupported',
				construct: 'an assignment to something other than a name or member',
			};
		const value = expressionTreeOf(expression.right as AnyNode | undefined);
		const operator = String(expression.operator);
		if (operator === '=') return assignTo(target, value);
		return COMPOUND.has(operator)
			? assignTo(target, {
					kind: 'binary',
					operator: operator.slice(0, -1) as Extract<
						SemanticExpression,
						{ kind: 'binary' }
					>['operator'],
					left: readOf(target),
					right: value,
				})
			: { kind: 'unsupported', construct: `the \`${operator}\` assignment` };
	}
	const tree = expressionTreeOf(expression);
	return { kind: 'unsupported', construct: tree.kind === 'unsupported' ? tree.construct : 'an expression statement' };
};

/** `const a = x` and `const { a, b: c } = x` as names and values, or the construct no native build binds. */
function constBindingsOf(
	declaration: AnyNode,
): ReadonlyArray<readonly [string, SemanticExpression]> | string {
	if (declaration.kind !== 'const') return `a \`${String(declaration.kind)}\` declaration`;
	const bindings: (readonly [string, SemanticExpression])[] = [];
	for (const declarator of asNodes(declaration.declarations)) {
		const id = declarator.id as AnyNode | undefined;
		const value = expressionTreeOf(declarator.init as AnyNode | undefined);
		if (id?.type === 'Identifier' && typeof id.name === 'string') {
			bindings.push([id.name, value]);
			continue;
		}
		if (id?.type !== 'ObjectPattern') return 'an array destructuring';
		for (const property of asNodes(id.properties)) {
			const key = property.key as AnyNode | undefined;
			const local = property.value as AnyNode | undefined;
			if (
				property.type !== 'Property' ||
				property.computed ||
				key?.type !== 'Identifier' ||
				typeof key.name !== 'string' ||
				local?.type !== 'Identifier' ||
				typeof local.name !== 'string'
			)
				return 'a destructuring with a default, rest or computed key';
			bindings.push([local.name, { kind: 'member', object: value, property: key.name }]);
		}
	}
	return bindings;
}

const declaresDirectly = (block: AnyNode): AnyNode | undefined =>
	asNodes(block.body).find((statement) => statement.type === 'VariableDeclaration');

function blockStatementsOf(statement: AnyNode | undefined, inList = false): SemanticHandlerStatement[] {
	if (!statement) return [];
	if (statement.type === 'BlockStatement') {
		const declaration = inList ? declaresDirectly(statement) : undefined;
		if (declaration)
			return [{ kind: 'unsupported', construct: `a \`${String(declaration.kind)}\` inside a bare block` }];
		return asNodes(statement.body).flatMap((inner) => blockStatementsOf(inner, true));
	}
	if (statement.type === 'EmptyStatement') return [];
	if (statement.type === 'VariableDeclaration') {
		const bindings = constBindingsOf(statement);
		return typeof bindings === 'string'
			? [{ kind: 'unsupported', construct: bindings }]
			: bindings.map(([name, value]) => ({ kind: 'const', name, value }));
	}
	if (statement.type === 'ExpressionStatement')
		return [statementOf(statement.expression as AnyNode)];
	if (statement.type === 'ReturnStatement')
		return statement.argument
			? [{ kind: 'unsupported', construct: 'a `return` with a value' }]
			: [{ kind: 'return' }];
	if (statement.type === 'IfStatement')
		return [
			{
				kind: 'if',
				test: expressionTreeOf(statement.test as AnyNode),
				whenTrue: blockStatementsOf(statement.consequent as AnyNode),
				whenFalse: blockStatementsOf((statement.alternate as AnyNode | null) ?? undefined),
			},
		];
	return [{ kind: 'unsupported', construct: `a ${String(statement.type)}` }];
}

/** Whether `name` is read in `tree` where it means the outer binding (not a lambda parameter or `let` of that name). */
function readsName(tree: SemanticExpression, name: string): boolean {
	switch (tree.kind) {
		case 'read':
			return tree.name === name;
		case 'literal':
		case 'unsupported':
			return false;
		case 'unary':
			return readsName(tree.value, name);
		case 'binary':
		case 'logical':
			return readsName(tree.left, name) || readsName(tree.right, name);
		case 'conditional':
			return [tree.test, tree.consequent, tree.alternate].some((part) => readsName(part, name));
		case 'template':
			return tree.parts.some((part) => typeof part !== 'string' && readsName(part, name));
		case 'member':
			return readsName(tree.object, name);
		case 'call':
		case 'apply':
			return tree.arguments.some((argument) => readsName(argument, name));
		case 'method':
			return readsName(tree.object, name) || tree.arguments.some((argument) => readsName(argument, name));
		case 'array':
			return tree.items.some((item) => readsName(item.value, name));
		case 'object':
			return tree.entries.some(([, value]) => readsName(value, name));
		case 'lambda':
			return !tree.parameters.includes(name) && readsName(tree.body, name);
		case 'let':
			return readsName(tree.value, name) || (tree.name !== name && readsName(tree.body, name));
	}
}

/**
 * A computed's statements as one tree, `after` being what the statements following their block give: `const` is a
 * `let`, `if` a conditional, `return` its value and falling off the end `undefined`.
 */
function returnChainOf(statements: ReadonlyArray<AnyNode>, after: SemanticExpression): SemanticExpression {
	const [first, ...rest] = statements;
	if (!first) return after;
	const branch = (node: AnyNode | null | undefined, otherwise: SemanticExpression) =>
		!node ? otherwise : returnChainOf(node.type === 'BlockStatement' ? asNodes(node.body) : [node], otherwise);
	switch (first.type) {
		case 'EmptyStatement':
			return returnChainOf(rest, after);
		case 'ReturnStatement':
			return first.argument ? expressionTreeOf(first.argument as AnyNode) : { kind: 'literal', value: null };
		case 'BlockStatement':
			return branch(first, returnChainOf(rest, after));
		case 'IfStatement': {
			const otherwise = returnChainOf(rest, after);
			return {
				kind: 'conditional',
				test: expressionTreeOf(first.test as AnyNode),
				consequent: branch(first.consequent as AnyNode, otherwise),
				alternate: branch(first.alternate as AnyNode | null, otherwise),
			};
		}
		case 'VariableDeclaration': {
			const bindings = constBindingsOf(first);
			if (typeof bindings === 'string') return unsupported(bindings);
			if (bindings.some(([name]) => readsName(after, name)))
				return unsupported('a `const` that hides a name read after its block');
			return bindings.reduceRight<SemanticExpression>(
				(body, [name, value]) => ({ kind: 'let', name, value, body }),
				returnChainOf(rest, after),
			);
		}
		default:
			return unsupported(`a ${String(first.type)}`);
	}
}

/** A computed's block body as one tree a native host evaluates. */
export function computedBodyOf(node: AnyNode): SemanticExpression {
	return returnChainOf(asNodes(node.body), { kind: 'literal', value: null });
}

/** A module-level function's parameters and return value as one tree; a defaulted parameter reads `p ?? default`. */
export function functionBodyOf(node: AnyNode): { parameters: string[]; body: SemanticExpression } {
	const parameters: string[] = [];
	const defaults: (readonly [string, SemanticExpression])[] = [];
	for (const parameter of asNodes(node.params)) {
		const target = parameter.type === 'AssignmentPattern' ? (parameter.left as AnyNode | undefined) : parameter;
		if (target?.type !== 'Identifier' || typeof target.name !== 'string')
			return { parameters, body: unsupported('a function with a pattern or rest parameter') };
		parameters.push(target.name);
		if (parameter.type === 'AssignmentPattern')
			defaults.push([
				target.name,
				{
					kind: 'logical',
					operator: '??',
					left: { kind: 'read', name: target.name },
					right: expressionTreeOf(parameter.right as AnyNode),
				},
			]);
	}
	const body = node.body as AnyNode | undefined;
	const value: SemanticExpression = node.async || node.generator
		? unsupported('an async or generator function')
		: body?.type === 'BlockStatement'
			? computedBodyOf(body)
			: expressionTreeOf(body);
	return {
		parameters,
		body: defaults.reduceRight<SemanticExpression>((inner, [name, fallback]) => ({ kind: 'let', name, value: fallback, body: inner }), value),
	};
}

/** A handler's body as statements a native host runs: assignments, calls, `const`, `if` and bare `return`, each value a tree. */
export function handlerStatementsOf(
	node: AnyNode | undefined,
): ReadonlyArray<SemanticHandlerStatement> | undefined {
	if (!node || (node.type !== 'ArrowFunctionExpression' && node.type !== 'FunctionExpression'))
		return undefined;
	if (node.async) return [{ kind: 'unsupported', construct: 'an async handler' }];
	// A parameter's default applies when no value (undefined, which native values spell null) is passed.
	const defaults = asNodes(node.params).flatMap((parameter): SemanticHandlerStatement[] => {
		const name = (parameter.left as AnyNode | undefined)?.name;
		return parameter.type === 'AssignmentPattern' && typeof name === 'string'
			? [
					{
						kind: 'const',
						name,
						value: {
							kind: 'logical',
							operator: '??',
							left: { kind: 'read', name },
							right: expressionTreeOf(parameter.right as AnyNode),
						},
					},
				]
			: [];
	});
	const body = node.body as AnyNode | undefined;
	return [...defaults, ...(body?.type === 'BlockStatement' ? blockStatementsOf(body) : [statementOf(body ?? null)])];
}

/** A component's prop defaults, rest spread, `state()` initializers and the writes its body makes while rendering. */
export function componentNativeFactsOf(
	node: AnyNode,
	isFrameworkCall: (node: AnyNode, api: 'state') => boolean,
): SemanticComponentNativeFacts {
	const propDefaults: Record<string, SemanticExpression> = {};
	let restProp: string | undefined;
	const pattern = asNodes(node.params)[0];
	if (pattern?.type === 'ObjectPattern') {
		for (const property of asNodes(pattern.properties)) {
			if (property.type === 'RestElement') {
				const argument = property.argument as AnyNode | undefined;
				if (argument?.type === 'Identifier' && typeof argument.name === 'string')
					restProp = argument.name;
				continue;
			}
			const value = property.value as AnyNode | undefined;
			const local =
				value?.type === 'AssignmentPattern'
					? (value.left as AnyNode | undefined)
					: undefined;
			if (
				value?.type === 'AssignmentPattern' &&
				local?.type === 'Identifier' &&
				typeof local.name === 'string'
			)
				propDefaults[local.name] = expressionTreeOf(value.right as AnyNode);
		}
	}
	const stateInitializers: Record<string, SemanticExpression> = {};
	const renderStatements: SemanticHandlerStatement[] = [];
	const body = node.body as AnyNode | undefined;
	for (const statement of asNodes(body?.body)) {
		if (statement.type === 'VariableDeclaration') {
			for (const declarator of asNodes(statement.declarations)) {
				const id = declarator.id as AnyNode | undefined;
				const init = declarator.init as AnyNode | undefined;
				if (id?.type !== 'Identifier' || typeof id.name !== 'string' || !init) continue;
				if (init.type === 'CallExpression' && isFrameworkCall(init, 'state'))
					stateInitializers[id.name] = expressionTreeOf(asNodes(init.arguments)[0]);
			}
			continue;
		}
		if (statement.type !== 'ExpressionStatement') continue;
		const expression = statement.expression as AnyNode | undefined;
		if (expression?.type?.startsWith('JSX')) continue;
		renderStatements.push(statementOf(expression ?? null));
	}
	return { propDefaults, ...(restProp ? { restProp } : {}), stateInitializers, renderStatements };
}

/** What a native build passes as `nativeFacts`; nothing else imports this module. */
export const NATIVE_FACT_COLLECTORS: NativeFactCollectors = {
	expression: expressionTreeOf as NativeFactCollectors['expression'],
	computedBody: computedBodyOf as NativeFactCollectors['computedBody'],
	functionBody: functionBodyOf as NativeFactCollectors['functionBody'],
	handlerStatements: handlerStatementsOf as NativeFactCollectors['handlerStatements'],
	component: componentNativeFactsOf as unknown as NativeFactCollectors['component'],
};
