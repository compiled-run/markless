import { asNodes, isNode, unwrapTypeAssertion, type AnyNode } from '../../ast/nodes.ts';
import type { SemanticGraphBinding, SemanticGraphDiagnostic, SourceSpan } from '../../artifacts.ts';
import { resolvedSymbolAt } from './collect-expressions.ts';
import { declaredInNestedTemplate } from './render-local-inline.ts';
import type { ModuleSemantics } from './shared-ast.ts';
import type { WalkState } from './types.ts';

type Binding = ModuleSemantics['bindings'][number];

// One object at two state paths updates separately, and a plain local computed from state is a copy: both refuse.

/** After the walk: template reads of state copies, and one object placed in state twice. */
export function collectStateSnapshots(state: WalkState): void {
	if (!state.graph.graphBindings.some((binding) => binding.kind === 'state')) return;
	collectSnapshotReads(state);
	collectSharedObjects(state);
}

function collectSnapshotReads(state: WalkState): void {
	const semantic = state.semantic();
	const verdicts = new Map<number, string | null>();
	const reported = new Set<number>();
	for (const read of state.graph.templateReads) {
		if (!read.sourceSpan || read.computedGraphNodeId) continue;
		const node = nodeAt(semantic, read.sourceSpan.start, read.sourceSpan.end);
		if (!node) continue;
		for (const identifier of referencedIdentifiers(node)) {
			const binding = bindingAt(semantic, identifier);
			if (!binding || reported.has(binding.id)) continue;
			const source = snapshotSource(binding, state, verdicts, new Set());
			if (!source) continue;
			reported.add(binding.id);
			state.graph.diagnostics.push(
				snapshotReadDiagnostic(
					binding.name,
					source,
					read.source,
					read.sourceSpan,
					state.filename,
				),
			);
		}
	}
}

// The state a plain const or let of the component body was built from; null for state, aliases and constants.
function snapshotSource(
	binding: Binding,
	state: WalkState,
	verdicts: Map<number, string | null>,
	visiting: Set<number>,
): string | null {
	const known = verdicts.get(binding.id);
	if (known !== undefined) return known;
	if (visiting.has(binding.id)) return null;
	visiting.add(binding.id);
	const verdict = computeSnapshotSource(binding, state, verdicts, visiting);
	verdicts.set(binding.id, verdict);
	return verdict;
}

function computeSnapshotSource(
	binding: Binding,
	state: WalkState,
	verdicts: Map<number, string | null>,
	visiting: Set<number>,
): string | null {
	if (!isComponentBodyBinding(binding)) return null;
	const semantic = state.semantic();
	const declaration = binding.declarations[0] as unknown as AnyNode | undefined;
	const declarator =
		declaration && (semantic.parentOf(declaration as never) as unknown as AnyNode | null);
	if (declarator?.type !== 'VariableDeclarator' || declarator.id !== declaration) return null;
	const init = unwrapTypeAssertion(declarator.init as AnyNode | undefined);
	if (!init || isFunction(init) || isFrameworkCall(init, state)) return null;
	if (!declaration || isGraphName(binding, declaration, state)) return null;
	// A const in a row or arm body re-runs with that block: only a body copy it reads is stale.
	const rerun =
		typeof declaration.start === 'number' && declaredInNestedTemplate(declaration.start, state);
	for (const identifier of referencedIdentifiers(init)) {
		const used = bindingAt(semantic, identifier);
		if (!used) continue;
		const usedDeclaration = used.declarations[0] as unknown as AnyNode | undefined;
		if (usedDeclaration && isStateName(used, usedDeclaration, state)) {
			if (rerun) continue;
			return used.name;
		}
		const inner = snapshotSource(used, state, verdicts, visiting);
		if (inner) return inner;
	}
	return null;
}

function isFrameworkCall(node: AnyNode, state: WalkState): boolean {
	const callee = node.type === 'CallExpression' ? (node.callee as AnyNode | undefined) : undefined;
	return callee?.type === 'Identifier' && state.frameworkApiImports.has(callee.name as string);
}

function isComponentBodyBinding(binding: Binding): boolean {
	for (const scope of binding.scope.ancestors()) {
		if (scope.kind !== 'function') continue;
		return (
			((scope.node as unknown as AnyNode).body as AnyNode | undefined)?.type ===
			'JSXCodeBlock'
		);
	}
	return false;
}

// A name the graph already follows: state, computed, a recorded alias, a shared instance.
function isGraphName(binding: Binding, declaration: AnyNode, state: WalkState): boolean {
	if (isGraphBinding(binding, state, () => true)) return true;
	const start = declaration.start;
	if (
		state.graph.aliases.some(
			(alias) => alias.name === binding.name && alias.sourceSpan?.start === start,
		)
	) {
		return true;
	}
	return state.graph.sharedInstances.some((instance) => instance.localName === binding.name);
}

function isStateName(binding: Binding, declaration: AnyNode, state: WalkState): boolean {
	if (isGraphBinding(binding, state, (kind) => kind === 'state' || kind === 'computed'))
		return true;
	return state.graph.aliases.some(
		(alias) =>
			alias.name === binding.name &&
			alias.sourceSpan?.start === declaration.start &&
			!alias.propPath,
	);
}

// Graph bindings carry no declaration span, so a body binding is matched by its name and its component.
function isGraphBinding(
	binding: Binding,
	state: WalkState,
	accepts: (kind: SemanticGraphBinding['kind']) => boolean,
): boolean {
	if (!isComponentBodyBinding(binding)) return false;
	const component = componentNameOf(binding);
	return state.graph.graphBindings.some(
		(graph) =>
			graph.name === binding.name &&
			!graph.sharedDefinitionId &&
			(graph.componentName === undefined || graph.componentName === component) &&
			accepts(graph.kind),
	);
}

function componentNameOf(binding: Binding): string | undefined {
	for (const scope of binding.scope.ancestors()) {
		if (scope.kind !== 'function') continue;
		const id = (scope.node as unknown as AnyNode).id as AnyNode | undefined;
		return typeof id?.name === 'string' ? id.name : undefined;
	}
	return undefined;
}

/** One object written into two state() initializers, or twice into one. */
function collectSharedObjects(state: WalkState): void {
	const semantic = state.semantic();
	const placements = new Map<
		number,
		Array<{ readonly at: string; readonly span: SourceSpan | undefined }>
	>();
	for (const binding of semantic.bindings) {
		if (!isGraphBinding(binding, state, (kind) => kind === 'state')) continue;
		const declaration = binding.declarations[0] as unknown as AnyNode | undefined;
		const declarator =
			declaration && (semantic.parentOf(declaration as never) as unknown as AnyNode | null);
		const call =
			declarator?.type === 'VariableDeclarator'
				? unwrapTypeAssertion(declarator.init as AnyNode)
				: undefined;
		const callee =
			call?.type === 'CallExpression' ? (call.callee as AnyNode | undefined) : undefined;
		if (
			callee?.type !== 'Identifier' ||
			state.frameworkApiImports.get(callee.name as string) !== 'state'
		)
			continue;
		const initial = asNodes(call!.arguments)[0];
		if (!initial) continue;
		visitPlacements(initial, binding.name, (identifier, at) => {
			const placed = bindingAt(semantic, identifier);
			if (!placed || !holdsObjectValue(placed, state)) return;
			const list = placements.get(placed.id) ?? [];
			list.push({ at, span: spanOf(identifier, state.filename) });
			placements.set(placed.id, list);
		});
	}
	for (const [bindingId, list] of placements) {
		if (list.length < 2) continue;
		const name = semantic.bindings[bindingId]!.name;
		state.graph.diagnostics.push(
			sharedObjectDiagnostic({
				name,
				first: list[0]!.at,
				second: list[1]!.at,
				span: list[1]!.span,
				filename: state.filename,
			}),
		);
	}
}

// Each place a name sits in an initializer, with the state path it lands at.
function visitPlacements(
	node: AnyNode,
	at: string,
	visit: (identifier: AnyNode, at: string) => void,
): void {
	const value = unwrapTypeAssertion(node);
	if (!value) return;
	if (value.type === 'Identifier') {
		visit(value, at);
		return;
	}
	if (value.type === 'ObjectExpression') {
		for (const property of asNodes(value.properties)) {
			if (property.type === 'SpreadElement') continue;
			const key =
				(property.key as AnyNode | undefined)?.name ??
				(property.key as AnyNode | undefined)?.value;
			if (isNode(property.value))
				visitPlacements(property.value, `${at}.${String(key)}`, visit);
		}
		return;
	}
	if (value.type === 'ArrayExpression') {
		asNodes(value.elements).forEach((element, index) => {
			if (element.type !== 'SpreadElement')
				visitPlacements(element, `${at}[${index}]`, visit);
		});
	}
}

function holdsObjectValue(binding: Binding, state: WalkState): boolean {
	const semantic = state.semantic();
	const declaration = binding.declarations[0] as unknown as AnyNode | undefined;
	const declarator =
		declaration && (semantic.parentOf(declaration as never) as unknown as AnyNode | null);
	if (declarator?.type !== 'VariableDeclarator' || declarator.id !== declaration) return false;
	const init = unwrapTypeAssertion(declarator.init as AnyNode | undefined);
	return (
		init?.type === 'ObjectExpression' ||
		init?.type === 'ArrayExpression' ||
		init?.type === 'NewExpression'
	);
}

function referencedIdentifiers(node: AnyNode): AnyNode[] {
	const found: AnyNode[] = [];
	const visit = (current: AnyNode, parent: AnyNode | null): void => {
		if (current.type === 'Identifier') {
			const isProperty =
				(parent?.type === 'MemberExpression' &&
					parent.property === current &&
					parent.computed !== true) ||
				(parent?.type === 'Property' &&
					parent.key === current &&
					parent.shorthand !== true);
			if (!isProperty) found.push(current);
			return;
		}
		for (const key in current) {
			if (key === 'typeAnnotation' || key === 'typeArguments' || key === 'loc') continue;
			const child = current[key];
			if (Array.isArray(child)) {
				for (const item of child) if (isNode(item)) visit(item, current);
			} else if (isNode(child)) {
				visit(child, current);
			}
		}
	};
	visit(node, null);
	return found;
}

function bindingAt(semantic: ModuleSemantics, identifier: AnyNode): Binding | null {
	if (typeof identifier.start !== 'number') return null;
	const symbolId = resolvedSymbolAt(semantic, identifier.start);
	return symbolId === null ? null : (semantic.bindings[symbolId] ?? null);
}

function isFunction(node: AnyNode): boolean {
	return node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression';
}

function spanOf(node: AnyNode, filename: string): SourceSpan | undefined {
	return typeof node.start === 'number' && typeof node.end === 'number'
		? { filename, start: node.start, end: node.end }
		: undefined;
}

function nodeAt(semantic: ModuleSemantics, start: number, end: number): AnyNode | null {
	let node = semantic.nodeAt(start) as unknown as AnyNode | null;
	while (node && !(node.start === start && node.end === end)) {
		const parent = semantic.parentOf(node as never) as unknown as AnyNode | null;
		if (!parent || (parent.start as number) < start || (parent.end as number) > end)
			return null;
		node = parent;
	}
	return node;
}

function snapshotReadDiagnostic(
	name: string,
	source: string,
	read: string,
	span: SourceSpan,
	filename: string,
): SemanticGraphDiagnostic {
	return {
		code: 'MARKLESS_TEMPLATE_READS_STATE_COPY',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'The page shows a copy of state taken once',
		message: `The page shows \`${read}\` as it was when the page rendered: "${name}" is a plain value the component body computed once from the state "${source}", so a change to "${source}" never reaches it.`,
		why: 'A component body runs once, when the page renders. A plain const built from state is a copy of that moment; only state, computed() and paths into them update the page.',
		primarySpan: span ?? { filename, start: 0, end: 0 },
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		statePath: read,
		source: read,
		suggestions: [
			{
				message: `Make "${name}" a computed(): \`const ${name} = computed(() => ...)\` with the same expression, or read "${source}" in the template directly.`,
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_TEMPLATE_READS_STATE_COPY',
	};
}

function sharedObjectDiagnostic(input: {
	readonly name: string;
	readonly first: string;
	readonly second: string;
	readonly span: SourceSpan | undefined;
	readonly filename: string;
}): SemanticGraphDiagnostic {
	return {
		code: 'MARKLESS_STATE_SHARED_OBJECT',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'One object at two state paths',
		message: `"${input.name}" is placed in state twice, at ${input.first} and ${input.second}. A change made through one of them would not update what the page shows through the other.`,
		why: 'Markless tracks a change by the state path it was written through. One object reachable from two paths changes under both, but only the path that was written is updated on the page.',
		primarySpan: input.span ?? { filename: input.filename, start: 0, end: 0 },
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		statePath: input.second,
		source: input.name,
		suggestions: [
			{
				message: `Give each path its own copy (\`{ ...${input.name} }\`), or keep the object once and refer to it by an id from the other place.`,
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_STATE_SHARED_OBJECT',
	};
}
