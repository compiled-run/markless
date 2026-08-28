import type { SemanticElementRosterCount } from '../../artifacts.ts';
import { asNodes, childNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource, sourceSpan } from '../../ast/source.ts';
import { getComponentFunction } from '../../ast/tsrx.ts';
import { pendingDeriveOwner } from './collect-async.ts';
import { resolvedSymbolAt } from './collect-expressions.ts';
import { rosterCountSpentDiagnostic } from './diagnostics.ts';
import { deriveQueryExpression, replaceDependencies } from './roster-position.ts';
import { ownedModuleAst } from './shared-ast.ts';
import type { WalkState } from './types.ts';

/**
 * The second derive-time element() handle read the compiler answers instead of
 * refusing: how many parts the family instance has.
 *
 * It is the same question as the position — render order, which the framework
 * knows on both sides — so it is answerable for the same reason. It needs no
 * member handle and no proof of membership, so the root or any part may ask.
 *
 * Admitted only for the exact question. The derive body is `roster.length` and
 * nothing else, and the roster is a plural handle off a shared() instance.
 * Anything looser stays refused by `elementHandleDeriveReadDiagnostic`.
 */
export function collectElementRosterCounts(state: WalkState): void {
	const graph = state.graph;
	const records: SemanticElementRosterCount[] = [];

	for (const pending of state.pendingComputedDependencies) {
		const owner = pendingDeriveOwner(pending, state);
		if (!owner || owner.kind !== 'computed' || owner.async === true) continue;
		const componentName = owner.componentName;
		if (!componentName || owner.sharedDefinitionId !== undefined) continue;
		const query = countQueryExpression(pending.body);
		if (!query) continue;

		const rosterSource = expressionSource(query.roster, state.source);
		if (!rosterSource) continue;

		const dependencies = owner.dependencies ?? [];
		if (dependencies.length !== 1) continue;
		const rosterDependency = dependencies[0]!;
		if (rosterDependency.source !== `${rosterSource}.length`) continue;
		if (rosterDependency.path.length !== 1 || rosterDependency.path[0] !== 'length') continue;

		const roster = graph.graphBindings.find(
			(binding) =>
				binding.id === rosterDependency.graphNodeId &&
				binding.kind === 'element' &&
				binding.plural === true &&
				binding.sharedDefinitionId !== undefined,
		);
		if (!roster) continue;

		const span = sourceSpan(query.node, state.filename);
		records.push({
			computedGraphNodeId: owner.id,
			computedName: owner.name,
			componentName,
			rosterGraphNodeId: roster.id,
			rosterSource,
			source: expressionSource(query.node, state.source) ?? '',
			...(span ? { sourceSpan: span } : {}),
		});
		// `.length` leaves the path: the lowered call answers the count, and the
		// node a runtime invalidates on is the roster itself.
		replaceDependencies(graph.graphBindings, owner, [
			{ ...rosterDependency, source: rosterSource, path: [] },
		]);
	}

	if (records.length === 0) return;
	graph.elementRosterCounts = records;
	for (const record of records) refuseSpentRosterCount(state, record);
}

/**
 * The count is exact when it is PRINTED and wrong when it is SPENT, so the
 * compiler draws that line rather than letting a page ship the difference.
 *
 * Allowed at render time: the bare read, as a whole attribute value, as a whole
 * text interpolation, or as one `${}` slot of a template literal. Everything
 * else in a render position - arithmetic, a comparison, a call, a second
 * computed deriving off it - is refused by name. Handler bodies are untouched:
 * by the time one runs the count is a number in the graph.
 */
function refuseSpentRosterCount(state: WalkState, record: SemanticElementRosterCount): void {
	const component = componentFunction(state, record.componentName);
	if (!component) return;
	const declared = countDeclarationId(component, record.computedName);
	if (typeof declared?.start !== 'number') return;
	const semantic = state.semantic();
	const symbolId = declaredSymbolAt(semantic, declared.start);
	if (symbolId === null) return;

	const seen = new Set<AnyNode>();
	const visit = (node: AnyNode, ancestors: ReadonlyArray<AnyNode>): void => {
		if (seen.has(node)) return;
		seen.add(node);
		if (
			node.type === 'Identifier' &&
			node !== declared &&
			typeof node.start === 'number' &&
			getIdentifierName(node) === record.computedName &&
			resolvedSymbolAt(semantic, node.start) === symbolId
		) {
			const spend = renderTime(ancestors) ? spentAt(node, ancestors) : null;
			if (spend) {
				state.graph.diagnostics.push(
					rosterCountSpentDiagnostic({
						computedName: record.computedName,
						componentName: record.componentName,
						operation: spend.operation,
						source: expressionSource(spend.node, state.source) ?? record.computedName,
						...(sourceSpan(spend.node, state.filename)
							? { span: sourceSpan(spend.node, state.filename)! }
							: {}),
					}),
				);
			}
			return;
		}
		const chain = [...ancestors, node];
		for (const child of markupChildNodes(node)) visit(child, chain);
	};
	visit(component, []);
}

// The shared walk skips `openingElement`, so an attribute expression is only
// reachable through it - and an attribute is where a count is usually spent.
function markupChildNodes(node: AnyNode): AnyNode[] {
	const opening = node.openingElement as AnyNode | undefined;
	return opening ? [...childNodes(node), ...childNodes(opening)] : childNodes(node);
}

type Spend = { readonly node: AnyNode; readonly operation: string };

/**
 * Whether the render itself performs this read. A read the render never
 * performs is not a spend: by the time a handler runs, the count is a number in
 * the graph, and every arithmetic it does there is right. So the question is
 * settled by the nearest enclosing function, before any operation is judged -
 * `w.count = total` inside an onClick must not read as an assignment spend.
 */
function renderTime(ancestors: ReadonlyArray<AnyNode>): boolean {
	// `ancestors[0]` is the component itself, which may be written as an arrow.
	for (let at = ancestors.length - 1; at >= 1; at -= 1) {
		const node = ancestors[at]!;
		if (node.type !== 'ArrowFunctionExpression' && node.type !== 'FunctionExpression') continue;
		return isDeriveFunction(ancestors[at - 1], node);
	}
	return true;
}

/**
 * Walks out from the read to the first node that decides how the value is
 * used. A template literal slot is transparent - the count is stringified into
 * the text either way - so the walk steps through it and judges what holds the
 * template.
 *
 * A read the render never performs is not a spend: by the time a handler runs,
 * the count is a number in the graph. So the walk stops at the nearest function
 * that is not a derive, and says nothing.
 */
function spentAt(read: AnyNode, ancestors: ReadonlyArray<AnyNode>): Spend | null {
	let child = read;
	for (let at = ancestors.length - 1; at >= 0; at -= 1) {
		const parent = ancestors[at]!;
		if (parent.type === 'TemplateLiteral' && asNodes(parent.expressions).includes(child)) {
			child = parent;
			continue;
		}
		if (isPrintedPosition(parent, child)) return null;
		if (parent.type === 'ArrowFunctionExpression' || parent.type === 'FunctionExpression') {
			// A derive is the one function the render runs, and the value it
			// publishes is a second binding holding the placeholder.
			return isDeriveFunction(ancestors[at - 1], parent)
				? { node: parent, operation: 'a derivation of the count' }
				: null;
		}
		// Statement scaffolding inside a derive body carries the value out unchanged.
		if (parent.type === 'ReturnStatement' || parent.type === 'BlockStatement') {
			child = parent;
			continue;
		}
		const operation = operationName(parent, child);
		return operation ? { node: parent, operation } : null;
	}
	return null;
}

// A markup slot: the value the renderer prints, verbatim, wherever it stands.
function isPrintedPosition(parent: AnyNode, child: AnyNode): boolean {
	if (parent.type === 'JSXExpressionContainer' || parent.type === 'TSRXExpression')
		return parent.expression === child;
	// The block-with-one-expression form a bare arm interpolation parses as.
	if (parent.type === 'ExpressionStatement') return parent.expression === child;
	return false;
}

function isDeriveFunction(grandparent: AnyNode | undefined, fn: AnyNode): boolean {
	if (grandparent?.type !== 'CallExpression') return false;
	if (!asNodes(grandparent.arguments).includes(fn)) return false;
	return getIdentifierName(grandparent.callee as AnyNode | undefined) === 'computed';
}

/** The operation, in the words the author wrote it in. */
function operationName(parent: AnyNode, child: AnyNode): string | null {
	switch (parent.type) {
		case 'BinaryExpression':
		case 'LogicalExpression':
		case 'AssignmentExpression':
			return `a "${String(parent.operator)}" operation`;
		case 'UnaryExpression':
		case 'UpdateExpression':
			return `a "${String(parent.operator)}" operation`;
		case 'ConditionalExpression':
			return parent.test === child ? 'a condition' : 'a branch of a conditional';
		case 'MemberExpression':
			return parent.object === child ? 'a property read' : null;
		case 'CallExpression':
		case 'NewExpression':
			return parent.callee === child ? 'a call' : 'a call argument';
		case 'ArrayExpression':
		case 'ObjectExpression':
		case 'Property':
		case 'SpreadElement':
			return 'a composite value';
		case 'VariableDeclarator':
			return parent.init === child ? 'a local the render carries forward' : null;
		default:
			return null;
	}
}

function componentFunction(state: WalkState, componentName: string): AnyNode | null {
	const ast = ownedModuleAst(state, state.source, state.filename);
	for (const statement of asNodes(ast.body)) {
		const component = getComponentFunction(statement);
		if (component?.name === componentName) return component.node;
	}
	return null;
}

/** The `const <name> = computed(...)` declarator id inside the component body. */
function countDeclarationId(component: AnyNode, computedName: string): AnyNode | null {
	let found: AnyNode | null = null;
	const visit = (node: AnyNode): void => {
		if (found) return;
		if (node.type === 'VariableDeclarator') {
			const id = node.id as AnyNode | undefined;
			if (id && getIdentifierName(id) === computedName) {
				found = id;
				return;
			}
		}
		for (const child of childNodes(node)) visit(child);
	};
	visit(component);
	return found;
}

/** The binding a declaration site introduces, found by where its name starts. */
function declaredSymbolAt(
	semantic: ReturnType<WalkState['semantic']>,
	offset: number,
): number | null {
	for (let symbolId = 0; symbolId < semantic.symbol.count; symbolId += 1) {
		for (let declIndex = 0; declIndex < semantic.symbol.declCount(symbolId); declIndex += 1) {
			if (semantic.symbol.declNode(symbolId, declIndex).start === offset) return symbolId;
		}
	}
	return null;
}

type CountQuery = {
	readonly node: AnyNode;
	readonly roster: AnyNode;
};

/** `() => roster.length`, with nothing else in the body. */
function countQueryExpression(body: AnyNode | undefined): CountQuery | null {
	const node = deriveQueryExpression(body);
	if (node?.type !== 'MemberExpression') return null;
	if (node.computed === true || node.optional === true) return null;
	if (getIdentifierName(node.property as AnyNode | undefined) !== 'length') return null;

	const roster = node.object as AnyNode | undefined;
	if (roster?.type !== 'Identifier' && roster?.type !== 'MemberExpression') return null;
	return { node, roster };
}
