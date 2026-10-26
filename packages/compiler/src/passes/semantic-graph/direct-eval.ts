import { parseJavaScriptModule } from '../../js-ast.ts';
import { asNodes, isNode, type AnyNode } from '../../ast/nodes.ts';
import { sourceSpan } from '../../ast/source.ts';
import type { SemanticGraphDiagnostic } from '../../artifacts.ts';

// A direct eval inside a component runs in an extracted handler or render module, where the
// component's own names are not in scope; refuse the ones that name them or cannot be read.
export function collectDirectEvalDiagnostics(input: {
	readonly ast: AnyNode;
	readonly component: AnyNode;
	readonly componentName: string;
	readonly filename: string;
}): SemanticGraphDiagnostic[] {
	let moduleNames: Set<string> | undefined;
	const diagnostics: SemanticGraphDiagnostic[] = [];
	walkAll(input.component, (node) => {
		if (node.type !== 'CallExpression' || node.optional) return;
		const callee = node.callee as AnyNode | undefined;
		if (callee?.type !== 'Identifier' || callee.name !== 'eval') return;
		const code = staticEvalSource(asNodes(node.arguments)[0]);
		moduleNames ??= declaredNames(input.ast);
		const named = code === undefined ? undefined : evalNamesBinding(code, moduleNames);
		if (named === null) return;
		diagnostics.push(directEvalDiagnostic({ ...input, call: node, named }));
	});
	return diagnostics;
}

function staticEvalSource(argument: AnyNode | undefined): string | undefined {
	if (argument?.type === 'Literal' && typeof argument.value === 'string') return argument.value;
	if (argument?.type === 'TemplateLiteral' && asNodes(argument.expressions).length === 0)
		return asNodes(argument.quasis)
			.map((quasi) => (quasi.value as { readonly cooked?: string }).cooked ?? '')
			.join('');
	return undefined;
}

// The first file-declared name the eval code reads, `undefined` when it does not parse, `null` when it names none.
function evalNamesBinding(code: string, names: ReadonlySet<string>): string | null | undefined {
	let program: AnyNode;
	try {
		program = parseJavaScriptModule(code, 'eval.js') as unknown as AnyNode;
	} catch {
		return undefined;
	}
	const skipped = new Set<AnyNode>();
	let found: string | null = null;
	walkAll(program, (node) => {
		if (found) return;
		if (node.type === 'MemberExpression' && !node.computed && isNode(node.property))
			skipped.add(node.property);
		if (node.type === 'Property' && !node.computed && !node.shorthand && isNode(node.key))
			skipped.add(node.key);
		if (node.type === 'Identifier' && !skipped.has(node) && names.has(node.name as string))
			found = node.name as string;
	});
	return found;
}

function declaredNames(ast: AnyNode): Set<string> {
	const names = new Set<string>();
	const addPattern = (pattern: unknown): void => {
		if (!isNode(pattern)) return;
		if (pattern.type === 'Identifier') names.add(pattern.name as string);
		else if (pattern.type === 'ObjectPattern')
			for (const property of asNodes(pattern.properties))
				addPattern(property.type === 'RestElement' ? property.argument : property.value);
		else if (pattern.type === 'ArrayPattern')
			for (const item of asNodes(pattern.elements)) addPattern(item);
		else if (pattern.type === 'AssignmentPattern') addPattern(pattern.left);
		else if (pattern.type === 'RestElement') addPattern(pattern.argument);
		else if (pattern.type === 'TSParameterProperty') addPattern(pattern.parameter);
	};
	walkAll(ast, (node) => {
		if (node.type === 'VariableDeclarator') addPattern(node.id);
		else if (
			node.type === 'FunctionDeclaration' ||
			node.type === 'FunctionExpression' ||
			node.type === 'ArrowFunctionExpression'
		) {
			addPattern(node.id);
			for (const param of asNodes(node.params)) addPattern(param);
		} else if (node.type === 'ClassDeclaration') addPattern(node.id);
		else if (node.type === 'CatchClause') addPattern(node.param);
		else if (
			node.type === 'ImportSpecifier' ||
			node.type === 'ImportDefaultSpecifier' ||
			node.type === 'ImportNamespaceSpecifier'
		)
			addPattern(node.local);
	});
	return names;
}

function directEvalDiagnostic(input: {
	readonly call: AnyNode;
	readonly componentName: string;
	readonly filename: string;
	readonly named: string | undefined;
}): SemanticGraphDiagnostic {
	return {
		code: 'MARKLESS_DIRECT_EVAL_UNSUPPORTED',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'eval() cannot reach component names',
		message: input.named
			? `\`eval\` in \`${input.componentName}\` runs code that reads \`${input.named}\`, but handlers and render code run in their own modules, where \`${input.named}\` is not defined.`
			: `\`eval\` in \`${input.componentName}\` runs code the compiler cannot read, so it cannot tell whether that code needs this component's names; handlers and render code run in their own modules, where those names are not defined.`,
		why: 'The compiler moves handlers and derived values into separate modules and rewrites every read and write of state it can see in the source. Code inside an eval string is invisible to it, so it would throw a ReferenceError or change state without updating the page.',
		primarySpan: sourceSpan(input.call, input.filename),
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		suggestions: [
			{
				message:
					"Write the code directly (before: `eval('count++')`, after: `count++`). To run code that only needs globals, call `new Function(code)()` or `(0, eval)(code)` instead.",
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_DIRECT_EVAL_UNSUPPORTED',
	};
}

const skippedKeys = new Set(['loc', 'metadata', 'parent', 'range']);

// Unlike walkNode, reaches markup attributes, where handlers live.
function walkAll(node: AnyNode, visit: (node: AnyNode) => void): void {
	visit(node);
	for (const key in node) {
		if (skippedKeys.has(key)) continue;
		const value = node[key];
		if (Array.isArray(value)) {
			for (const item of value) if (isNode(item)) walkAll(item, visit);
		} else if (isNode(value)) walkAll(value, visit);
	}
}
