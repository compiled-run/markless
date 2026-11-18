import { BindingFlags } from '@tsrx/yuku';
import type { AnyNode } from '../../ast/nodes.ts';
import { asNodes } from '../../ast/nodes.ts';
import type {
	NativeFactCollectors,
	SemanticExpression,
	SemanticHandlerStatement,
	SemanticNameOrigin,
	SemanticNativeGap,
} from '../../artifacts.ts';
import { moduleSemantics, type ModuleSemantics } from './shared-ast.ts';

const UNARY = new Set(['!', '-', '+']);
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
const FUNCTION_DEPTH = 4;
const TRANSPARENT = new Set(['ChainExpression', 'ParenthesizedExpression', 'TSAsExpression', 'TSNonNullExpression', 'TSSatisfiesExpression']);

const unsupported = (construct: string, gap?: SemanticNativeGap): SemanticExpression =>
	gap ? { kind: 'unsupported', construct, gap } : { kind: 'unsupported', construct };

function calleeName(node: AnyNode | undefined): string | null {
	if (node?.type === 'Identifier' && typeof node.name === 'string') return node.name;
	if (node?.type === 'MemberExpression' && !node.computed) {
		const object = calleeName(node.object as AnyNode | undefined);
		const property = (node.property as AnyNode | undefined)?.name;
		return object && typeof property === 'string' ? `${object}.${property}` : null;
	}
	return null;
}

const rootIdentifier = (node: AnyNode | undefined): AnyNode | undefined =>
	node?.type === 'Identifier'
		? node
		: node?.type === 'MemberExpression'
			? rootIdentifier(node.object as AnyNode | undefined)
			: node && TRANSPARENT.has(String(node.type))
				? rootIdentifier(node.expression as AnyNode | undefined)
				: undefined;

const isFunctionNode = (node: AnyNode | undefined): boolean =>
	node?.type === 'ArrowFunctionExpression' ||
	node?.type === 'FunctionExpression' ||
	node?.type === 'FunctionDeclaration';

/** Builds trees for one module; with its scope analysis, gaps say what their names resolve to. */
function treeBuilder(semantic: ModuleSemantics | undefined) {
	let referencesBySpan: Map<string, ModuleSemantics['references'][number]> | undefined;
	const following = new Set<AnyNode>();

	const originOf = (identifier: AnyNode | undefined, depth: number): SemanticNameOrigin | null => {
		if (!semantic || identifier?.type !== 'Identifier') return null;
		referencesBySpan ??= new Map(
			semantic.references.map((reference) => [`${reference.node.start}:${reference.node.end}`, reference]),
		);
		const reference = referencesBySpan.get(`${identifier.start}:${identifier.end}`);
		const binding = reference?.binding;
		if (!binding) return { kind: 'global' };
		const scope = binding.scope === semantic.rootScope ? 'module' : 'local';
		if (binding.has(BindingFlags.Import)) {
			const entry = semantic.imports.find((candidate) => candidate.local?.id === binding.id);
			return { kind: 'import', source: entry?.specifier ?? '', imported: entry?.name ?? null };
		}
		if (binding.has(BindingFlags.Parameter)) return { kind: 'parameter' };
		if (binding.has(BindingFlags.Class)) return { kind: 'class' };
		const declaration = binding.declarations[0] as AnyNode | undefined;
		const parent = declaration && (semantic.parentOf(declaration as never) as AnyNode | null);
		const fn = binding.has(BindingFlags.Function)
			? parent
			: parent?.type === 'VariableDeclarator' && isFunctionNode(parent.init as AnyNode | undefined)
				? (parent.init as AnyNode)
				: undefined;
		if (!fn) {
			const init = parent?.type === 'VariableDeclarator' ? (parent.init as AnyNode | undefined) : undefined;
			if (!init || depth >= FUNCTION_DEPTH || following.has(init)) return { kind: 'variable', scope, name: binding.name };
			following.add(init);
			const initializer = tree(init, depth + 1);
			following.delete(init);
			return { kind: 'variable', scope, name: binding.name, initializer };
		}
		if (depth >= FUNCTION_DEPTH || following.has(fn)) return { kind: 'function', scope };
		following.add(fn);
		const body = statementsOfFunction(fn, depth + 1);
		following.delete(fn);
		const parameters = asNodes(fn.params).map((parameter) =>
			parameter.type === 'Identifier' ? String(parameter.name) : '',
		);
		return { kind: 'function', scope, parameters, ...(body ? { body } : {}) };
	};

	const lambdaOf = (node: AnyNode, depth: number): SemanticExpression => {
		const parameters = asNodes(node.params);
		if (node.async || parameters.some((parameter) => parameter.type !== 'Identifier'))
			return unsupported('a function with a pattern or async parameters', { kind: 'function-value' });
		const body = node.body as AnyNode | undefined;
		if (!body || body.type === 'BlockStatement')
			return unsupported('a function with a block body', { kind: 'function-value' });
		return { kind: 'lambda', parameters: parameters.map((parameter) => String(parameter.name)), body: tree(body, depth) };
	};

	function tree(node: AnyNode | undefined, depth: number): SemanticExpression {
		if (!node) return unsupported('a missing expression', { kind: 'other', nodeType: 'missing' });
		switch (node.type) {
			case 'ParenthesizedExpression':
			case 'JSXExpressionContainer':
			case 'ChainExpression':
				return tree(node.expression as AnyNode | undefined, depth);
			case 'TSAsExpression':
			case 'TSNonNullExpression':
			case 'TSSatisfiesExpression':
				return unsupported(`a ${String(node.type)}`, {
					kind: 'type-assertion',
					value: tree(node.expression as AnyNode | undefined, depth),
				});
			case 'Identifier':
				if (node.name === 'undefined') return { kind: 'literal', value: null };
				if (typeof node.name !== 'string') return unsupported('a name');
				return originOf(node, FUNCTION_DEPTH)?.kind === 'global'
					? { kind: 'read', name: node.name, global: true }
					: { kind: 'read', name: node.name };
			case 'Literal':
				return typeof node.value === 'string' ||
					typeof node.value === 'boolean' ||
					typeof node.value === 'number' ||
					node.value === null
					? { kind: 'literal', value: node.value as string | number | boolean | null }
					: unsupported('a regular expression or bigint literal', { kind: 'other', nodeType: 'RegExpLiteral' });
			case 'TemplateLiteral': {
				const quasis = asNodes(node.quasis).map((quasi) => {
					const value = quasi.value as { cooked?: string } | undefined;
					return value?.cooked ?? '';
				});
				const expressions = asNodes(node.expressions).map((expression) => tree(expression, depth));
				return {
					kind: 'template',
					parts: quasis.flatMap((text, index) =>
						index < expressions.length ? [text, expressions[index]!] : [text],
					),
				};
			}
			case 'UnaryExpression':
				return typeof node.operator === 'string' && UNARY.has(node.operator)
					? { kind: 'unary', operator: node.operator as '!' | '-' | '+', value: tree(node.argument as AnyNode, depth) }
					: unsupported(`the \`${String(node.operator)}\` operator`, {
							kind: 'operator',
							operator: String(node.operator),
							operands: [tree(node.argument as AnyNode, depth)],
						});
			case 'BinaryExpression':
				return typeof node.operator === 'string' && BINARY.has(node.operator)
					? {
							kind: 'binary',
							operator: node.operator as Extract<SemanticExpression, { kind: 'binary' }>['operator'],
							left: tree(node.left as AnyNode, depth),
							right: tree(node.right as AnyNode, depth),
						}
					: unsupported(`the \`${String(node.operator)}\` operator`, {
							kind: 'operator',
							operator: String(node.operator),
							operands: [tree(node.left as AnyNode, depth), tree(node.right as AnyNode, depth)],
						});
			case 'LogicalExpression':
				return typeof node.operator === 'string' && LOGICAL.has(node.operator)
					? {
							kind: 'logical',
							operator: node.operator as '&&' | '||' | '??',
							left: tree(node.left as AnyNode, depth),
							right: tree(node.right as AnyNode, depth),
						}
					: unsupported(`the \`${String(node.operator)}\` operator`);
			case 'ConditionalExpression':
				return {
					kind: 'conditional',
					test: tree(node.test as AnyNode, depth),
					consequent: tree(node.consequent as AnyNode, depth),
					alternate: tree(node.alternate as AnyNode, depth),
				};
			case 'MemberExpression': {
				const property = (node.property as AnyNode | undefined)?.name;
				return !node.computed && typeof property === 'string'
					? { kind: 'member', object: tree(node.object as AnyNode, depth), property }
					: unsupported('a computed member read', {
							kind: 'computed-member',
							object: tree(node.object as AnyNode, depth),
							key: tree(node.property as AnyNode, depth),
						});
			}
			case 'CallExpression': {
				const callee = node.callee as AnyNode | undefined;
				const member = callee?.type === 'MemberExpression' && !callee.computed ? callee : undefined;
				const method = (member?.property as AnyNode | undefined)?.name;
				const argumentsOf = () =>
					asNodes(node.arguments).map((argument) =>
						argument.type === 'ArrowFunctionExpression' ? lambdaOf(argument, depth) : tree(argument, depth),
					);
				if (typeof method === 'string' && METHODS.has(method) && !BUILTINS.has(calleeName(callee) ?? '')) {
					return { kind: 'method', method, object: tree(member!.object as AnyNode, depth), arguments: argumentsOf() };
				}
				const name = calleeName(callee);
				if (name && BUILTINS.has(name))
					return { kind: 'call', callee: name, arguments: asNodes(node.arguments).map((argument) => tree(argument, depth)) };
				return unsupported(`a call to \`${name ?? 'a computed function'}\``, {
					kind: 'call',
					callee: name,
					origin: originOf(rootIdentifier(callee), depth),
					...(member ? { object: tree(member.object as AnyNode, depth) } : {}),
					...(typeof method === 'string' ? { method } : {}),
					optional: node.optional === true || (member?.optional as boolean | undefined) === true,
					arguments: argumentsOf(),
				});
			}
			case 'NewExpression': {
				const name = calleeName(node.callee as AnyNode | undefined);
				return unsupported(`a NewExpression`, {
					kind: 'new',
					callee: name,
					origin: originOf(rootIdentifier(node.callee as AnyNode | undefined), depth),
				});
			}
			case 'AssignmentExpression':
			case 'UpdateExpression': {
				const target = (node.left ?? node.argument) as AnyNode | undefined;
				const written = node.type === 'AssignmentExpression' ? tree(node.right as AnyNode | undefined, depth) : { kind: 'literal' as const, value: 1 };
				const { gap } = memberWrite(target, written, depth);
				return unsupported(
					`a ${String(node.type)}`,
					gap.kind === 'member-write' ? gap : { kind: 'operator', operator: String(node.operator), operands: [written] },
				);
			}
			case 'AwaitExpression':
				return unsupported('`await`', { kind: 'await', value: tree(node.argument as AnyNode | undefined, depth) });
			case 'ArrowFunctionExpression':
			case 'FunctionExpression':
				return unsupported('a function value', { kind: 'function-value' });
			case 'ArrayExpression':
				return {
					kind: 'array',
					items: asNodes(node.elements).map((element) =>
						element?.type === 'SpreadElement'
							? { spread: true, value: tree(element.argument as AnyNode, depth) }
							: { spread: false, value: tree(element ?? undefined, depth) },
					),
				};
			case 'ObjectExpression': {
				const entries: (readonly [string, SemanticExpression])[] = [];
				for (const property of asNodes(node.properties)) {
					const key = property.key as AnyNode | undefined;
					const name = key?.type === 'Identifier' ? key.name : key?.type === 'Literal' ? key.value : undefined;
					if (property.type !== 'Property' || property.computed || property.kind !== 'init' || typeof name !== 'string')
						return unsupported('an object with a spread, computed key or method', {
							kind: 'other',
							nodeType: 'ObjectSpreadOrMethod',
						});
					entries.push([name, tree(property.value as AnyNode, depth)]);
				}
				return { kind: 'object', entries };
			}
			default:
				return unsupported(`a ${String(node.type)}`, { kind: 'other', nodeType: String(node.type) });
		}
	}

	const statementOf = (expression: AnyNode | null, depth: number): SemanticHandlerStatement => {
		if (!expression)
			return { kind: 'unsupported', construct: 'a statement other than an expression' };
		if (expression.type === 'ParenthesizedExpression')
			return statementOf((expression.expression as AnyNode | undefined) ?? null, depth);
		if (
			expression.type === 'CallExpression' &&
			(expression.callee as AnyNode | undefined)?.type === 'Identifier' &&
			asNodes(expression.arguments).length === 0 &&
			!BUILTINS.has(String((expression.callee as AnyNode).name))
		) {
			const origin = originOf(expression.callee as AnyNode, depth);
			return { kind: 'invoke', name: String((expression.callee as AnyNode).name), ...(origin ? { origin } : {}) };
		}
		if (expression.type === 'UpdateExpression') {
			const target = expression.argument as AnyNode | undefined;
			if (target?.type !== 'Identifier' || typeof target.name !== 'string')
				return {
					kind: 'unsupported',
					construct: 'an update of something other than a name',
					...memberWrite(target, { kind: 'literal', value: 1 }, depth),
				};
			const read: SemanticExpression = { kind: 'read', name: target.name };
			return {
				kind: 'assign',
				target: target.name,
				value: {
					kind: 'binary',
					operator: expression.operator === '--' ? '-' : '+',
					left: { kind: 'unary', operator: '+', value: read },
					right: { kind: 'literal', value: 1 },
				},
			};
		}
		if (expression.type === 'AssignmentExpression') {
			const target = expression.left as AnyNode | undefined;
			const value = tree(expression.right as AnyNode | undefined, depth);
			if (target?.type !== 'Identifier' || typeof target.name !== 'string')
				return {
					kind: 'unsupported',
					construct: 'an assignment to something other than a name',
					...memberWrite(target, value, depth),
				};
			const operator = String(expression.operator);
			if (operator === '=') return { kind: 'assign', target: target.name, value };
			return COMPOUND.has(operator)
				? {
						kind: 'assign',
						target: target.name,
						value: {
							kind: 'binary',
							operator: operator.slice(0, -1) as Extract<SemanticExpression, { kind: 'binary' }>['operator'],
							left: { kind: 'read', name: target.name },
							right: value,
						},
					}
				: {
						kind: 'unsupported',
						construct: `the \`${operator}\` assignment`,
						gap: { kind: 'operator', operator, operands: [{ kind: 'read', name: target.name }, value] },
					};
		}
		const expressionTree = tree(expression, depth);
		return expressionTree.kind === 'unsupported'
			? { kind: 'unsupported', construct: expressionTree.construct, ...(expressionTree.gap ? { gap: expressionTree.gap } : {}) }
			: { kind: 'unsupported', construct: 'an expression statement', gap: { kind: 'other', nodeType: 'UnusedValue' } };
	};

	const memberWrite = (
		target: AnyNode | undefined,
		value: SemanticExpression,
		depth: number,
	): { gap: SemanticNativeGap } => {
		const member = target?.type === 'MemberExpression' ? target : undefined;
		const property = member && !member.computed ? (member.property as AnyNode | undefined)?.name : undefined;
		return member
			? {
					gap: {
						kind: 'member-write',
						origin: originOf(rootIdentifier(member), depth),
						object: tree(member.object as AnyNode, depth),
						property: typeof property === 'string' ? property : null,
						value,
					},
				}
			: { gap: { kind: 'other', nodeType: String(target?.type) } };
	};

	const blockOf = (node: AnyNode | undefined, depth: number): ReadonlyArray<SemanticHandlerStatement> =>
		!node ? [] : node.type === 'BlockStatement' ? asNodes(node.body).map((item) => statement(item, depth)) : [statement(node, depth)];

	const flow = (
		construct: string,
		statementKind: Extract<SemanticNativeGap, { kind: 'control-flow' }>['statement'],
		tests: ReadonlyArray<SemanticExpression>,
		inner: ReadonlyArray<SemanticHandlerStatement>,
	): SemanticHandlerStatement => ({
		kind: 'unsupported',
		construct,
		gap: { kind: 'control-flow', statement: statementKind, tests, inner },
	});

	function statement(node: AnyNode, depth: number): SemanticHandlerStatement {
		const construct = `a ${String(node.type)}`;
		switch (node.type) {
			case 'ExpressionStatement':
				return statementOf(node.expression as AnyNode, depth);
			case 'IfStatement':
				return flow(construct, 'if', [tree(node.test as AnyNode, depth)], [
					...blockOf(node.consequent as AnyNode, depth),
					...blockOf(node.alternate as AnyNode | undefined, depth),
				]);
			case 'ReturnStatement':
				return flow(construct, 'return', node.argument ? [tree(node.argument as AnyNode, depth)] : [], []);
			case 'BlockStatement':
				return flow(construct, 'block', [], blockOf(node, depth));
			case 'BreakStatement':
			case 'ContinueStatement':
				return flow(construct, 'break', [], []);
			case 'ThrowStatement':
				return flow(construct, 'throw', [tree(node.argument as AnyNode, depth)], []);
			case 'SwitchStatement':
				return flow(
					construct,
					'switch',
					[tree(node.discriminant as AnyNode, depth), ...asNodes(node.cases).flatMap((item) => (item.test ? [tree(item.test as AnyNode, depth)] : []))],
					asNodes(node.cases).flatMap((item) => asNodes(item.consequent).map((inner) => statement(inner, depth))),
				);
			case 'TryStatement':
				return flow(construct, 'try', [], [
					...blockOf(node.block as AnyNode, depth),
					...blockOf((node.handler as AnyNode | undefined)?.body as AnyNode | undefined, depth),
					...blockOf(node.finalizer as AnyNode | undefined, depth),
				]);
			case 'ForStatement':
			case 'ForOfStatement':
			case 'ForInStatement':
			case 'WhileStatement':
			case 'DoWhileStatement':
				return {
					kind: 'unsupported',
					construct,
					gap: {
						kind: 'loop',
						tests: [node.test, node.right, node.update]
							.filter((part): part is AnyNode => Boolean(part))
							.map((part) => tree(part, depth)),
						inner: blockOf(node.body as AnyNode, depth),
					},
				};
			case 'VariableDeclaration': {
				const declarators = asNodes(node.declarations);
				const destructures = declarators.some((declarator) => (declarator.id as AnyNode | undefined)?.type !== 'Identifier');
				return {
					kind: 'unsupported',
					construct,
					gap: {
						kind: 'local',
						declaration: destructures ? 'destructure' : (String(node.kind) as 'const' | 'let' | 'var'),
						values: declarators.flatMap((declarator) =>
							declarator.init ? [tree(declarator.init as AnyNode, depth)] : [],
						),
					},
				};
			}
			case 'FunctionDeclaration':
				return { kind: 'unsupported', construct, gap: { kind: 'function-value' } };
			default:
				return { kind: 'unsupported', construct, gap: { kind: 'other', nodeType: String(node.type) } };
		}
	}

	function statementsOfFunction(node: AnyNode | undefined, depth: number): ReadonlyArray<SemanticHandlerStatement> | undefined {
		if (!isFunctionNode(node)) return undefined;
		const body = node!.body as AnyNode | undefined;
		const statements =
			body?.type !== 'BlockStatement'
				? [statementOf(body ?? null, depth)]
				: asNodes(body.body).map((item) =>
						semantic
							? statement(item, depth)
							: item.type === 'ExpressionStatement'
								? statementOf(item.expression as AnyNode, depth)
								: ({ kind: 'unsupported', construct: `a ${String(item.type)}` } as const),
					);
		if (!node!.async) return statements;
		return [{ kind: 'unsupported', construct: 'an async handler', ...(semantic ? { gap: { kind: 'async-function', body: statements } } : {}) }];
	}

	return {
		expression: (node: AnyNode | undefined) => tree(node, 0),
		handlerStatements: (node: AnyNode | undefined) => statementsOfFunction(node, 0),
		functionOf: (node: AnyNode | undefined) =>
			isFunctionNode(node)
				? {
						parameters: asNodes(node!.params).map((parameter) =>
							parameter.type === 'Identifier' ? String(parameter.name) : '',
						),
						body: statementsOfFunction(node, 0) ?? [],
					}
				: undefined,
	};
}

const returnedObject = (factory: AnyNode | undefined): AnyNode | undefined => {
	const body = factory?.body as AnyNode | undefined;
	if (body?.type === 'ObjectExpression') return body;
	if (body?.type === 'ParenthesizedExpression') return returnedObject({ body: body.expression } as AnyNode);
	if (body?.type !== 'BlockStatement') return undefined;
	const returned = asNodes(body.body).findLast((statement) => statement.type === 'ReturnStatement');
	const argument = returned?.argument as AnyNode | undefined;
	return argument?.type === 'ObjectExpression' ? argument : undefined;
};

/**
 * A function another module exports, as native facts: `name` itself, or with `member`, the method of that name on the
 * object a factory export returns (`shared(() => ({ flip() {} }))`). For measuring handlers that call across modules.
 */
export function exportedFunctionFacts(
	module: { readonly source: string; readonly filename: string },
	name: string,
	member?: string,
): { readonly parameters: ReadonlyArray<string>; readonly body: ReadonlyArray<SemanticHandlerStatement> } | undefined {
	const semantic = moduleSemantics(module.source, module.filename);
	const binding = semantic.resolveExport(name)?.binding ?? semantic.rootScope.find(name);
	if (!binding || binding.module !== semantic) return undefined;
	const declaration = binding.declarations[0] as AnyNode | undefined;
	const parent = declaration && (semantic.parentOf(declaration as never) as AnyNode | null);
	const value = parent?.type === 'VariableDeclarator' ? (parent.init as AnyNode | undefined) : parent ?? undefined;
	const builder = treeBuilder(semantic);
	if (member === undefined) return builder.functionOf(value);
	const factory = value?.type === 'CallExpression' ? asNodes(value.arguments)[0] : undefined;
	const property = asNodes(returnedObject(factory)?.properties).find(
		(candidate) => candidate.type === 'Property' && (candidate.key as AnyNode | undefined)?.name === member,
	);
	return builder.functionOf(property?.value as AnyNode | undefined);
}

/** A template value, test or assigned value as a tree a native host evaluates; names are the component's bindings. */
export function expressionTreeOf(node: AnyNode | undefined, semantic?: ModuleSemantics): SemanticExpression {
	return treeBuilder(semantic).expression(node);
}

/** A handler's body as statements a native host runs: assignments to names, each value a tree. */
export function handlerStatementsOf(
	node: AnyNode | undefined,
	semantic?: ModuleSemantics,
): ReadonlyArray<SemanticHandlerStatement> | undefined {
	return treeBuilder(semantic).handlerStatements(node);
}

/** What a native build passes as `nativeFacts`; nothing else imports this module. */
export const NATIVE_FACT_COLLECTORS: NativeFactCollectors = {
	expression: expressionTreeOf as NativeFactCollectors['expression'],
	handlerStatements: handlerStatementsOf as NativeFactCollectors['handlerStatements'],
};
