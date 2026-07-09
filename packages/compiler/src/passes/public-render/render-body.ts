import type { PublicRenderModuleInput } from '../../artifacts.ts';
import { asNodes, childNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource } from '../../ast/source.ts';
import { isIgnorableJsxTextNode as isIgnorableTextNode } from '../../ast/tsrx.ts';
import type { PublicRenderRoot } from './types.ts';

type GraphBinding = PublicRenderModuleInput['semanticGraph']['graphBindings'][number];
const loweredFrameworkCalls = new Set(['computed', 'element', 'handler']);
export function renderBodyLines(
	input: PublicRenderModuleInput,
	rootInfo: PublicRenderRoot,
	stateValueFunctionName: string,
	stateValuesName: string,
	statePayloadName: string,
	rootLines: ReadonlyArray<string>,
	graphReadSource?: string,
): string[] {
	const body = rootInfo.component.body as AnyNode | undefined;
	if (!body) return indentLines(rootLines);

	const stateBindings = new Map<string, GraphBinding>(
		input.semanticGraph.graphBindings.flatMap((binding) =>
			binding.kind === 'state' ? [[binding.name, binding]] : [],
		),
	);
	const computedBindings = new Map<string, GraphBinding>(
		input.semanticGraph.graphBindings.flatMap((binding) =>
			binding.kind === 'computed' ? [[binding.name, binding]] : [],
		),
	);
	const lines: string[] = [];
	let emittedRoot = false;
	for (const statement of childNodes(body)) {
		if (isIgnorableTextNode(statement)) continue;
		if (statement === rootInfo.root || returnArgument(statement) === rootInfo.root) {
			lines.push(...rootLines);
			emittedRoot = true;
			continue;
		}

		const stateLine = stateDeclarationLine(
			statement,
			stateBindings,
			stateValueFunctionName,
			stateValuesName,
			statePayloadName,
		);
		if (stateLine) {
			lines.push(stateLine);
			continue;
		}
		const computedLine = computedDeclarationLine(
			statement,
			computedBindings,
			input.semanticGraph.graphBindings,
			graphReadSource,
		);
		if (computedLine) {
			lines.push(computedLine);
			continue;
		}
		if (isLoweredFrameworkDeclaration(statement)) continue;

		const source = expressionSource(statement, input.source.source);
		if (source) lines.push(source);
	}
	if (!emittedRoot) lines.push(...rootLines);
	return indentLines(lines);
}

function computedDeclarationLine(
	statement: AnyNode,
	computedBindings: ReadonlyMap<string, GraphBinding>,
	graphBindings: ReadonlyArray<GraphBinding>,
	graphReadSource: string | undefined,
): string | null {
	if (statement.type !== 'VariableDeclaration') return null;
	const declarations = asNodes(statement.declarations);
	if (declarations.length !== 1) return null;
	const declaration = declarations[0]!;
	const name = getIdentifierName(declaration.id as AnyNode | undefined);
	const binding = name ? computedBindings.get(name) : undefined;
	if (
		!binding ||
		binding.async === true ||
		!binding.functionSource ||
		!isFrameworkCall(declaration.init as AnyNode | undefined, 'computed')
	) {
		return null;
	}

	const declarationKind = binding.declarationKind ?? 'const';
	const functionSource = graphReadSource
		? rewriteAsyncComputedDependencies(binding.functionSource, binding, graphBindings, graphReadSource)
		: binding.functionSource;
	const valueSource =
		functionSource === binding.functionSource
			? `(${functionSource})()`
			: `${graphReadSource} ? (${functionSource})() : undefined`;
	return `${declarationKind} ${binding.name} = ${valueSource};`;
}

function rewriteAsyncComputedDependencies(
	functionSource: string,
	binding: GraphBinding,
	graphBindings: ReadonlyArray<GraphBinding>,
	graphReadSource: string,
): string {
	const asyncComputedIds = new Set(
		graphBindings.flatMap((candidate) =>
			candidate.kind === 'computed' && candidate.async === true ? [candidate.id] : [],
		),
	);
	const replacements = (binding.dependencies ?? [])
		.filter((dependency) => asyncComputedIds.has(dependency.graphNodeId))
		.map((dependency) => ({
			source: dependency.source,
			replacement: graphReadCallSource(graphReadSource, dependency.graphNodeId, dependency.path),
		}))
		.sort((left, right) => right.source.length - left.source.length);

	let emitted = functionSource;
	for (const replacement of replacements) {
		emitted = emitted.replaceAll(replacement.source, replacement.replacement);
	}
	return emitted;
}

function graphReadCallSource(
	graphReadSource: string,
	graphNodeId: string,
	path: readonly string[],
): string {
	const read = path.length === 0
		? `${graphReadSource}.read(${JSON.stringify(graphNodeId)})`
		: `${graphReadSource}.read(${JSON.stringify(graphNodeId)}, ${JSON.stringify(path)})`;
	return `(${read})`;
}

function stateDeclarationLine(
	statement: AnyNode,
	stateBindings: ReadonlyMap<string, GraphBinding>,
	stateValueFunctionName: string,
	stateValuesName: string,
	statePayloadName: string,
): string | null {
	if (statement.type !== 'VariableDeclaration') return null;
	const declarations = asNodes(statement.declarations);
	if (declarations.length !== 1) return null;
	const declaration = declarations[0]!;
	const name = getIdentifierName(declaration.id as AnyNode | undefined);
	const binding = name ? stateBindings.get(name) : undefined;
	if (!binding || !isFrameworkCall(declaration.init as AnyNode | undefined, 'state')) return null;
	const initializerSource = (binding as GraphBinding & { readonly initializerSource?: string })
		.initializerSource;
	const args = [
		stateValuesName,
		statePayloadName,
		JSON.stringify(binding.id),
		initializerSource,
	].filter((arg): arg is string => arg !== undefined);
	return `let ${binding.name} = ${stateValueFunctionName}(${args.join(', ')});`;
}

function isStateDeclaration(statement: AnyNode): boolean {
	return (
		statement.type === 'VariableDeclaration' &&
		asNodes(statement.declarations).some((declaration) =>
			isFrameworkCall(declaration.init as AnyNode | undefined, 'state'),
		)
	);
}

function isLoweredFrameworkDeclaration(statement: AnyNode): boolean {
	if (statement.type !== 'VariableDeclaration') return false;
	return asNodes(statement.declarations).some((declaration) => {
		const init = declaration.init as AnyNode | undefined;
		return !!frameworkCallName(init) && loweredFrameworkCalls.has(frameworkCallName(init)!);
	});
}

function isFrameworkCall(node: AnyNode | null | undefined, name: string): boolean {
	return frameworkCallName(node) === name;
}

function frameworkCallName(node: AnyNode | null | undefined): string | null {
	return node?.type === 'CallExpression'
		? getIdentifierName(node.callee as AnyNode | undefined)
		: null;
}

function returnArgument(statement: AnyNode): AnyNode | undefined {
	return statement.type === 'ReturnStatement'
		? (statement.argument as AnyNode | undefined)
		: undefined;
}

function indentLines(lines: ReadonlyArray<string>): string[] {
	return lines.flatMap((line) => line.split('\n').map((part) => `	${part}`));
}

export function hasExecutableBodyStatements(
	component: AnyNode,
	root: AnyNode,
	source: string,
): boolean {
	const body = component.body as AnyNode | undefined;
	if (!body) return false;
	for (const statement of childNodes(body)) {
		if (isIgnorableTextNode(statement)) continue;
		if (statement === root || returnArgument(statement) === root) continue;
		if (isStateDeclaration(statement) || isLoweredFrameworkDeclaration(statement)) continue;
		if (expressionSource(statement, source)) return true;
	}
	return false;
}
