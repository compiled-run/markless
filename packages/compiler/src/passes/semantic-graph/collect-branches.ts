import { asNodes, childNodes, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource, sourceSpan } from '../../ast/source.ts';
import { stateWriteInTemplateDiagnostic } from './diagnostics.ts';
import type { WalkState } from './types.ts';

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
		state.graph.branchSites.push({
			id: `branch-site:${state.nextBranchSiteId++}`,
			kind: 'if',
			armCount: (node.consequent ? 1 : 0) + (node.alternate ? 1 : 0),
			testSource: test ? expressionSource(test, state.source) : '',
			anchorOrder: state.nextAnchorOrder++,
			...(state.currentAsyncBoundaryId ? { asyncBoundaryId: state.currentAsyncBoundaryId } : {}),
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
		state.graph.branchSites.push({
			id: `branch-site:${state.nextBranchSiteId++}`,
			kind: 'switch',
			armCount: asNodes(node.cases).length,
			testSource: discriminant ? expressionSource(discriminant, state.source) : '',
			anchorOrder: state.nextAnchorOrder++,
			...(state.currentAsyncBoundaryId ? { asyncBoundaryId: state.currentAsyncBoundaryId } : {}),
		});
	}
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
	for (const child of childNodes(node)) collectBranchConditionAssignments(child, branchSource, state);
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
