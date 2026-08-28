import type { SemanticElementRosterCount } from '../../artifacts.ts';
import { getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource, sourceSpan } from '../../ast/source.ts';
import { pendingDeriveOwner } from './collect-async.ts';
import { deriveQueryExpression, replaceDependencies } from './roster-position.ts';
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

	if (records.length > 0) graph.elementRosterCounts = records;
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
