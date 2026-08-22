import type { PublicRenderModuleInput } from '../../artifacts.ts';
import { asNodes, childNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource } from '../../ast/source.ts';
import { isIgnorableJsxTextNode as isIgnorableTextNode } from '../../ast/tsrx.ts';
import {
	findSharedInstance,
	resolveSharedInstanceGraphPath,
	sharedCallbackSlotGraphNodeId,
} from '../semantic-graph/collect-shared.ts';
import { sharedInstancePreludeLines } from './residue-reader.ts';
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
	const sharedInstanceNames = sharedInstanceLocalNames(input.semanticGraph);
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
			input,
			stateValuesName,
		);
		if (computedLine) {
			lines.push(computedLine);
			continue;
		}
		if (isLoweredFrameworkDeclaration(statement)) continue;
		if (isSharedInstanceDeclaration(statement, sharedInstanceNames)) continue;

		const seedLine = sharedStateSeedLine(
			statement,
			input,
			stateValueFunctionName,
			stateValuesName,
			statePayloadName,
		);
		if (seedLine) {
			lines.push(seedLine);
			continue;
		}
		// The instance local is gone here; state-lowering already failed the compile.
		if (isSharedInstanceAssignment(statement, input, sharedInstanceNames)) continue;

		const source = expressionSource(statement, input.source.source);
		if (source) lines.push(source);
	}
	if (!emittedRoot) lines.push(...rootLines);
	return indentLines(lines);
}

// `s.disabled = disabled` in a component body seeds the widget's shared
// instance: the assigned value replaces the factory initial for this render, so
// the emitted body sets the graph node instead of an absent local.
function sharedStateSeedLine(
	statement: AnyNode,
	input: PublicRenderModuleInput,
	stateValueFunctionName: string,
	stateValuesName: string,
	statePayloadName: string,
): string | null {
	if (statement.type !== 'ExpressionStatement') return null;
	const assignment = statement.expression as AnyNode | undefined;
	if (assignment?.type !== 'AssignmentExpression' || assignment.operator !== '=') return null;

	const target = expressionSource(assignment.left as AnyNode, input.source.source);
	const resolved = resolveSharedInstanceGraphPath(target, input.semanticGraph);
	if (!resolved) {
		return callbackSlotSeedLine(
			target,
			input,
			stateValueFunctionName,
			stateValuesName,
			statePayloadName,
		);
	}

	const value = expressionSource(assignment.right as AnyNode, input.source.source);
	const read = `${stateValuesName}.get(${JSON.stringify(resolved.binding.id)})`;
	// The seed writes the served payload too: resume never re-runs the body, so a
	// payload left holding the factory initial resumes a value nobody rendered.
	// An assignment always assigns: an omitted prop with no destructuring default
	// writes undefined, exactly as the same statement would in plain JavaScript.
	return `{ const marklessSharedSeed = (${value}); ${stateValueFunctionName}(${stateValuesName}, ${statePayloadName}, ${JSON.stringify(
		resolved.binding.id,
	)}, ${seedValueSource(read, resolved.path, 'marklessSharedSeed')}); }`;
}

/**
 * `checkbox.onChange = onChange` fills a callback slot. The value that reaches
 * the browser is not the closure but the id of the symbol this prop was compiled
 * into, which the composing edge already hands this root; writing it into the
 * slot's node is what lets a part's dispatch find the consumer's handler.
 */
function callbackSlotSeedLine(
	target: string,
	input: PublicRenderModuleInput,
	stateValueFunctionName: string,
	stateValuesName: string,
	statePayloadName: string,
): string | null {
	void stateValueFunctionName;
	void stateValuesName;
	const [localName, slotName, ...rest] = target.split('.');
	if (!localName || !slotName || rest.length > 0) return null;

	const instance = findSharedInstance(localName, input.semanticGraph);
	if (!instance) return null;

	const binding = (input.semanticGraph.sharedCallbackBindings ?? []).find(
		(candidate) =>
			candidate.definitionId === instance.definition.id && candidate.slotName === slotName,
	);
	if (!binding) return null;

	return `marklessSsrCallbackSlot(${statePayloadName}, ${JSON.stringify(
		sharedCallbackSlotGraphNodeId(binding.definitionId, binding.slotName),
	)}, marklessSsrCallbackSymbol(props, ${JSON.stringify([binding.propName])}));`;
}

function isSharedInstanceAssignment(
	statement: AnyNode,
	input: PublicRenderModuleInput,
	sharedInstanceNames: ReadonlySet<string>,
): boolean {
	if (statement.type !== 'ExpressionStatement' || sharedInstanceNames.size === 0) return false;
	const assignment = statement.expression as AnyNode | undefined;
	if (assignment?.type !== 'AssignmentExpression') return false;

	const target = expressionSource(assignment.left as AnyNode, input.source.source);
	const root = /^\s*([$A-Z_a-z][$\w]*)\s*[.[]/.exec(target ?? '')?.[1];
	return !!root && sharedInstanceNames.has(root);
}

function seedValueSource(
	readSource: string,
	path: ReadonlyArray<string>,
	valueSource: string,
): string {
	const [head, ...rest] = path;
	if (head === undefined) return valueSource;
	const nested = seedValueSource(
		`${readSource}?.[${JSON.stringify(head)}]`,
		rest,
		valueSource,
	);
	return `{ ...${readSource}, [${JSON.stringify(head)}]: ${nested} }`;
}

function computedDeclarationLine(
	statement: AnyNode,
	computedBindings: ReadonlyMap<string, GraphBinding>,
	input: PublicRenderModuleInput,
	stateValuesName: string,
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
	// No instance local exists here; rebuild it from the graph, as the residue readers do.
	const prelude = sharedInstancePreludeLines(
		input.semanticGraph,
		binding.functionSource,
		new Set(),
		(graphNodeId, path) =>
			`marklessSsrReadPublicPath(${stateValuesName}.get(${JSON.stringify(graphNodeId)}), ${JSON.stringify(path)})`,
	);
	if (prelude.length === 0) {
		return `${declarationKind} ${binding.name} = (${binding.functionSource})();`;
	}

	return `${declarationKind} ${binding.name} = (() => { ${prelude.join(' ')} return (${binding.functionSource})(); })();`;
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

// `const shell = session()` names a shared instance. Every read and write
// through that name is already a graph node id, so the emitted body keeps no
// local for it.
export function sharedInstanceLocalNames(
	semanticGraph: Pick<PublicRenderModuleInput['semanticGraph'], 'sharedInstances'>,
): ReadonlySet<string> {
	return new Set((semanticGraph.sharedInstances ?? []).map((instance) => instance.localName));
}

export function isSharedInstanceDeclaration(
	statement: AnyNode,
	sharedInstanceNames: ReadonlySet<string>,
): boolean {
	if (statement.type !== 'VariableDeclaration' || sharedInstanceNames.size === 0) return false;
	const declarators = asNodes(statement.declarations);
	if (declarators.length === 0) return false;
	return declarators.every((declarator) => {
		const name = getIdentifierName(declarator.id as AnyNode | undefined);
		return !!name && sharedInstanceNames.has(name);
	});
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
	sharedInstanceNames: ReadonlySet<string> = new Set(),
): boolean {
	const body = component.body as AnyNode | undefined;
	if (!body) return false;
	for (const statement of childNodes(body)) {
		if (isIgnorableTextNode(statement)) continue;
		if (statement === root || returnArgument(statement) === root) continue;
		if (isStateDeclaration(statement) || isLoweredFrameworkDeclaration(statement)) continue;
		if (isSharedInstanceDeclaration(statement, sharedInstanceNames)) continue;
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
	const sharedInstanceNames = sharedInstanceLocalNames(input.semanticGraph);
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
			if (isSharedInstanceDeclaration(statement, sharedInstanceNames)) continue;
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
