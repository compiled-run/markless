import type {
	SemanticElementRosterPosition,
	SemanticGraphBinding,
	SemanticGraphDependency,
} from '../../artifacts.ts';
import { asNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource, sourceSpan } from '../../ast/source.ts';
import { pendingDeriveOwner } from './collect-async.ts';
import type { WalkState } from './types.ts';

/**
 * The one derive-time element() handle read the compiler answers instead of
 * refusing: a part asking for its own place in its family's roster.
 *
 * Admitted only for the exact question. The derive body is the whole query and
 * nothing else, the roster is a plural handle off a shared() instance, the
 * argument is a singular handle this same part declared, and both are bound on
 * ONE of this part's host elements — which is what makes "I am a member of that
 * roster" true rather than assumed. Anything looser stays refused by
 * `elementHandleDeriveReadDiagnostic`.
 */
export function collectElementRosterPositions(state: WalkState): void {
	const graph = state.graph;
	const records: SemanticElementRosterPosition[] = [];

	for (const pending of state.pendingComputedDependencies) {
		const owner = pendingDeriveOwner(pending, state);
		if (!owner || owner.kind !== 'computed' || owner.async === true) continue;
		const componentName = owner.componentName;
		if (!componentName || owner.sharedDefinitionId !== undefined) continue;
		const query = positionQueryExpression(pending.body);
		if (!query) continue;

		const rosterSource = expressionSource(query.roster, state.source);
		const handleName = getIdentifierName(query.member);
		if (!rosterSource || !handleName) continue;

		const dependencies = owner.dependencies ?? [];
		const rosterDependency = dependencies.find(
			(dependency) => dependency.source === rosterSource,
		);
		const handleDependency = dependencies.find(
			(dependency) => dependency.source === handleName,
		);
		if (!rosterDependency || !handleDependency) continue;
		if (dependencies.length !== 2) continue;
		if (rosterDependency.path.length > 0 || handleDependency.path.length > 0) continue;

		const roster = graph.graphBindings.find(
			(binding) =>
				binding.id === rosterDependency.graphNodeId &&
				binding.kind === 'element' &&
				binding.plural === true &&
				binding.sharedDefinitionId !== undefined,
		);
		const member = graph.graphBindings.find(
			(binding) =>
				binding.id === handleDependency.graphNodeId &&
				binding.kind === 'element' &&
				binding.plural !== true &&
				binding.componentName === componentName,
		);
		if (!roster || !member) continue;

		const hostNodeId = sharedBindingHost(graph.elementHandleBindings, componentName, [
			rosterSource,
			handleName,
		]);
		if (!hostNodeId) continue;

		const span = sourceSpan(query.call, state.filename);
		records.push({
			computedGraphNodeId: owner.id,
			computedName: owner.name,
			componentName,
			rosterGraphNodeId: roster.id,
			rosterSource,
			handleGraphNodeId: member.id,
			handleName,
			hostNodeId,
			source: expressionSource(query.call, state.source) ?? '',
			...(span ? { sourceSpan: span } : {}),
		});
		// The member handle leaves the dependency list: the lowered call carries
		// its id, and only the roster is a node a runtime can invalidate on.
		replaceDependencies(graph.graphBindings, owner, [rosterDependency]);
	}

	if (records.length > 0) graph.elementRosterPositions = records;
}

export function replaceDependencies(
	bindings: SemanticGraphBinding[],
	owner: SemanticGraphBinding,
	dependencies: ReadonlyArray<SemanticGraphDependency>,
): void {
	const index = bindings.indexOf(owner);
	if (index < 0) return;
	bindings[index] = { ...owner, dependencies };
}

/** The single host element every named handle is bound on in this component. */
function sharedBindingHost(
	handleBindings: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly handleName: string;
		readonly componentName?: string;
	}>,
	componentName: string,
	handleNames: ReadonlyArray<string>,
): string | null {
	const hostsPerName = handleNames.map(
		(name) =>
			new Set(
				handleBindings
					.filter(
						(binding) =>
							binding.componentName === componentName && binding.handleName === name,
					)
					.map((binding) => binding.hostNodeId),
			),
	);
	if (hostsPerName.some((hosts) => hosts.size !== 1)) return null;
	const [first, ...rest] = hostsPerName.map((hosts) => [...hosts][0]!);
	if (first === undefined) return null;
	return rest.every((host) => host === first) ? first : null;
}

type PositionQuery = {
	readonly call: AnyNode;
	readonly roster: AnyNode;
	readonly member: AnyNode;
};

/**
 * `() => roster.indexOf(mine)`, with nothing else in the body — a block form
 * with one `return` reads the same. Type assertions around the argument are
 * stripped: `mine as HTMLDivElement` is what an author writes to satisfy the
 * declared element type, and it is not a different question.
 */
function positionQueryExpression(body: AnyNode | undefined): PositionQuery | null {
	const call = deriveQueryExpression(body);
	if (call?.type !== 'CallExpression' || call.optional === true) return null;

	const callee = call.callee as AnyNode | undefined;
	if (callee?.type !== 'MemberExpression' || callee.computed === true) return null;
	if (getIdentifierName(callee.property as AnyNode | undefined) !== 'indexOf') return null;

	const roster = callee.object as AnyNode | undefined;
	if (roster?.type !== 'Identifier' && roster?.type !== 'MemberExpression') return null;

	const args = asNodes(call.arguments);
	if (args.length !== 1) return null;
	const member = stripAssertions(args[0]!);
	if (member.type !== 'Identifier') return null;

	return { call, roster, member };
}

/**
 * The one expression a derive body evaluates to, or null if the body is anything
 * more than that. Both admitted roster queries are whole-body queries, because
 * the SSR half replaces the declaration rather than an inner span.
 */
export function deriveQueryExpression(body: AnyNode | undefined): AnyNode | null {
	if (!body) return null;
	if (body.type !== 'ArrowFunctionExpression' && body.type !== 'FunctionExpression') return null;
	if (body.async === true || asNodes(body.params).length > 0) return null;

	const inner = body.body as AnyNode | undefined;
	if (!inner) return null;
	const expression = inner.type === 'BlockStatement' ? singleReturnArgument(inner) : inner;
	return expression ?? null;
}

function singleReturnArgument(block: AnyNode): AnyNode | undefined {
	const statements = asNodes(block.body);
	if (statements.length !== 1) return undefined;
	const only = statements[0]!;
	return only.type === 'ReturnStatement' ? ((only.argument as AnyNode | undefined) ?? undefined) : undefined;
}

const ASSERTION_TYPES: ReadonlySet<string> = new Set([
	'TSAsExpression',
	'TSSatisfiesExpression',
	'TSNonNullExpression',
	'TSTypeAssertion',
	'ParenthesizedExpression',
]);

function stripAssertions(node: AnyNode): AnyNode {
	let current = node;
	while (current.type !== undefined && ASSERTION_TYPES.has(current.type)) {
		const next = (current.expression ?? current.argument) as AnyNode | undefined;
		if (!next) return current;
		current = next;
	}
	return current;
}
