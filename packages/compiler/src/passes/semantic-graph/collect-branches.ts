import { asNodes, childNodes, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource, sourceSpan } from '../../ast/source.ts';
import { type CompositeReadOptions, collectCompositeTemplateExpression } from './composite-reads.ts';
import { stateWriteInTemplateDiagnostic } from './diagnostics.ts';
import type { WalkState } from './types.ts';

/**
 * What counts as part of the read in a branch condition.
 *
 * A condition is a predicate, so the shapes a template text position deliberately
 * leaves out are the plainest way to write one: `!open` and `ticked.includes(id)`
 * have no shorter form, and `group.value === item.value` is the only way to say
 * "this row is the selected one". Left out, the condition resolved to no graph
 * node, the flip symbol was minted with an empty wake set, and the arm rendered
 * once and then froze while its siblings updated around it.
 *
 * `requireWritableRead` keeps the byte cost where the behavior is: a condition
 * over props alone is settled by the render that produced it, so it mints nothing
 * and keeps the empty wake set it has today.
 */
const BRANCH_CONDITION_READ_OPTIONS: CompositeReadOptions & {
	readonly requireWritableRead: boolean;
} = {
	unaryOperators: true,
	methodCalls: true,
	requireWritableRead: true,
};

/**
 * The source the branch site tests. A plain graph read is its own source. A
 * recombined condition becomes one synthetic computed - the same mint the
 * attribute and prop positions use - and the site tests that computed by name,
 * so every read inside the condition wakes the flip exactly as `@if (someComputed)`
 * already does. A condition that resolves to no graph node at all (a repeat local,
 * an opaque call) mints nothing and keeps its authored source.
 */
function branchTestSource(test: AnyNode | undefined, state: WalkState): string {
	if (!test) return '';
	const authored = expressionSource(test, state.source);
	const composite = collectCompositeTemplateExpression(test, state, BRANCH_CONDITION_READ_OPTIONS);
	if (!composite) return authored;
	const minted = state.graph.graphBindings.find(
		(binding) => binding.id === composite.graphNodeId,
	);
	return minted ? minted.name : authored;
}

// Records @if/@switch sites as first-class branch records sharing the unified
// document-order comment-anchor allocator with async boundaries. The
// public-render plan gates which sites become reactive; ungated sites keep
// their static render.
export function collectBranchSite(node: AnyNode, state: WalkState): void {
	if (node.type === 'JSXIfExpression') {
		const test = node.test as AnyNode | undefined;
		collectBranchConditionAssignments(
			test,
			`@if (${test ? expressionSource(test, state.source) : ''})`,
			state,
		);
		const ifTestSource = branchTestSource(test, state);
		state.graph.branchSites.push({
			id: `branch-site:${state.nextBranchSiteId++}`,
			kind: 'if',
			armCount: (node.consequent ? 1 : 0) + (node.alternate ? 1 : 0),
			testSource: ifTestSource,
			anchorOrder: state.nextAnchorOrder++,
			...(state.currentAsyncBoundaryId
				? {
						asyncBoundaryId: state.currentAsyncBoundaryId,
						asyncBoundaryArm: state.currentAsyncBoundaryArm ?? 0,
					}
				: {}),
		});
		return;
	}

	if (node.type === 'JSXSwitchExpression') {
		const discriminant = node.discriminant as AnyNode | undefined;
		collectBranchConditionAssignments(
			discriminant,
			`@switch (${discriminant ? expressionSource(discriminant, state.source) : ''})`,
			state,
		);
		const switchTestSource = branchTestSource(discriminant, state);
		state.graph.branchSites.push({
			id: `branch-site:${state.nextBranchSiteId++}`,
			kind: 'switch',
			armCount: asNodes(node.cases).length,
			testSource: switchTestSource,
			anchorOrder: state.nextAnchorOrder++,
			...(switchArmTests(node) ? { armTests: switchArmTests(node)! } : {}),
			...(state.currentAsyncBoundaryId
				? {
						asyncBoundaryId: state.currentAsyncBoundaryId,
						asyncBoundaryArm: state.currentAsyncBoundaryArm ?? 0,
					}
				: {}),
		});
	}
}

function switchArmTests(node: AnyNode): ReadonlyArray<unknown> | null {
	const tests: unknown[] = [];
	for (const switchCase of asNodes(node.cases)) {
		const test = switchCase.test as AnyNode | undefined;
		if (!test) {
			tests.push(null);
			continue;
		}
		if (test.type !== 'Literal' || typeof test.value === 'object') return null;
		tests.push(test.value);
	}
	return tests;
}

function collectBranchConditionAssignments(
	node: AnyNode | undefined,
	branchSource: string,
	state: WalkState,
): void {
	if (!node) return;
	if (node.type === 'AssignmentExpression') {
		const target = assignmentTarget(node.left as AnyNode | undefined, state);
		if (target) {
			state.graph.diagnostics.push(
				stateWriteInTemplateDiagnostic({
					source: branchSource,
					target: target.source,
					targetSpan: sourceSpan(target.node, state.filename),
					filename: state.filename,
					branchCondition: true,
				}),
			);
		}
	}
	for (const child of childNodes(node))
		collectBranchConditionAssignments(child, branchSource, state);
}

function assignmentTarget(
	node: AnyNode | undefined,
	state: WalkState,
): { readonly node: AnyNode; readonly source: string } | null {
	if (!node) return null;
	const source = expressionSource(node, state.source);
	const root = source.split(/[.[?]/, 1)[0] ?? source;
	if (state.graph.graphBindings.some((binding) => binding.name === root)) return { node, source };
	if (state.graph.aliases.some((alias) => alias.name === root)) return { node, source };
	return null;
}
