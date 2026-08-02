import type { PublicRenderModuleInput } from '../../artifacts.ts';
import { asNodes, childNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource } from '../../ast/source.ts';
import { isIgnorableJsxTextNode as isIgnorableTextNode } from '../../ast/tsrx.ts';
import type { PublicRenderRoot } from './types.ts';

type GraphBinding = PublicRenderModuleInput['semanticGraph']['graphBindings'][number];
const loweredFrameworkCalls = new Set(['computed', 'element', 'handler', 'storage']);

export function renderBodyLines(
	input: PublicRenderModuleInput,
	rootInfo: PublicRenderRoot,
	stateValueFunctionName: string,
	stateValuesName: string,
	statePayloadName: string,
	rootLines: ReadonlyArray<string>,
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
		const computedLine = computedDeclarationLine(statement, computedBindings);
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
		binding.asyncCapable === true ||
		!binding.functionSource ||
		!isFrameworkCall(declaration.init as AnyNode | undefined, 'computed')
	) {
		return null;
	}

	const declarationKind = binding.declarationKind ?? 'const';
	return `${declarationKind} ${binding.name} = (${binding.functionSource})();`;
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
	const init = declaration.init as AnyNode | undefined;
	if (
		!binding ||
		(!isFrameworkCall(init, 'state') && !(binding.storage && isFrameworkCall(init, 'storage')))
	)
		return null;
	const initializerSource =
		(binding as GraphBinding & { readonly initializerSource?: string }).initializerSource ??
		(binding.storage ? JSON.stringify(binding.initialValue) : undefined);
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
		asNodes(statement.declarations).some((declaration) => {
			const init = declaration.init as AnyNode | undefined;
			return isFrameworkCall(init, 'state') || isFrameworkCall(init, 'storage');
		})
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

// Emits the body prefix inside a demanded render-value function. Framework
// declarations become graph reads; ordinary locals retain authored order, but
// this prefix is never evaluated unless a visible chunk slot needs one of its
// values.
export function renderValuePreludeLines(
	input: PublicRenderModuleInput,
	rootInfo: PublicRenderRoot,
	demandedSources: ReadonlyArray<string>,
): string[] {
	const body = rootInfo.component.body as AnyNode | undefined;
	if (!body) return [];
	const stateBindings = new Map(
		input.semanticGraph.graphBindings.flatMap((binding) =>
			binding.kind === 'state' ? [[binding.name, binding] as const] : [],
		),
	);
	const computedBindings = new Map(
		input.semanticGraph.graphBindings.flatMap((binding) =>
			binding.kind === 'computed' ? [[binding.name, binding] as const] : [],
		),
	);
	const statements = childNodes(body).filter((statement) => {
		if (isIgnorableTextNode(statement)) return false;
		return statement !== rootInfo.root && returnArgument(statement) !== rootInfo.root;
	});
	const demandedText = new Set(demandedSources);
	const demandedNames = new Set<string>();
	for (const source of demandedSources)
		for (const match of source.matchAll(/\b[$A-Z_a-z][$\w]*\b/g)) demandedNames.add(match[0]);
	let changed = true;
	while (changed) {
		changed = false;
		for (const statement of statements) {
			const source = expressionSource(statement, input.source.source);
			if (!source) continue;
			const identifiers = [...source.matchAll(/\b[$A-Z_a-z][$\w]*\b/g)].map((match) => match[0]);
			const demanded =
				statement.type === 'VariableDeclaration'
					? asNodes(statement.declarations).some((declaration) => {
							const name = getIdentifierName(declaration.id as AnyNode | undefined);
							return !!name && demandedNames.has(name);
						})
					: identifiers.some((name) => demandedNames.has(name));
			if (!demanded || demandedText.has(source)) continue;
			demandedText.add(source);
			for (const name of identifiers) {
				if (!demandedNames.has(name)) {
					demandedNames.add(name);
					changed = true;
				}
			}
		}
	}
	const lines: string[] = [];
	for (const statement of statements) {
		if (isIgnorableTextNode(statement)) continue;
		if (statement.type === 'VariableDeclaration') {
			const declarations = asNodes(statement.declarations);
			if (declarations.length === 1) {
				const name = getIdentifierName(declarations[0]?.id as AnyNode | undefined);
				const binding = name ? stateBindings.get(name) ?? computedBindings.get(name) : undefined;
				if (binding) {
					lines.push(`${binding.declarationKind ?? 'const'} ${binding.name}=read(${JSON.stringify(binding.id)},[]);`);
					continue;
				}
			}
			if (isLoweredFrameworkDeclaration(statement)) continue;
		}
		const source = expressionSource(statement, input.source.source);
		if (
			source &&
			(statement.type === 'VariableDeclaration'
				? asNodes(statement.declarations).some((declaration) => {
						const name = getIdentifierName(declaration.id as AnyNode | undefined);
						return !!name && demandedNames.has(name);
					})
				: [...demandedNames].some((name) => new RegExp(`\\b${name.replace(/[$]/g, '\\$&')}\\b`).test(source)))
		)
			lines.push(source);
	}
	return lines;
}
