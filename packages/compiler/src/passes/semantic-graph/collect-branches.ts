import { asNodes, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource } from '../../ast/source.ts';
import type { WalkState } from './types.ts';

// Records @if/@switch sites as first-class branch records sharing the unified
// document-order comment-anchor allocator with async boundaries. The
// public-render plan gates which sites become reactive; ungated sites keep
// their static render.
export function collectBranchSite(node: AnyNode, state: WalkState): void {
	if (node.type === 'JSXIfExpression') {
		const test = node.test as AnyNode | undefined;
		state.graph.branchSites.push({
			id: `branch-site:${state.nextBranchSiteId++}`,
			kind: 'if',
			armCount: (node.consequent ? 1 : 0) + (node.alternate ? 1 : 0),
			testSource: test ? expressionSource(test, state.source) : '',
			anchorOrder: state.nextAnchorOrder++,
		});
		return;
	}

	if (node.type === 'JSXSwitchExpression') {
		const discriminant = node.discriminant as AnyNode | undefined;
		state.graph.branchSites.push({
			id: `branch-site:${state.nextBranchSiteId++}`,
			kind: 'switch',
			armCount: asNodes(node.cases).length,
			testSource: discriminant ? expressionSource(discriminant, state.source) : '',
			anchorOrder: state.nextAnchorOrder++,
		});
	}
}
