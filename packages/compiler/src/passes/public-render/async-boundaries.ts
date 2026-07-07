import { childNodes, type AnyNode } from '../../ast/nodes.ts';

export type AsyncBoundaryNode = {
	readonly node: AnyNode;
	readonly nested: boolean;
	containsNested: boolean;
	readonly conditional: boolean;
};

export function collectAsyncBoundaryNodes(root: AnyNode): AsyncBoundaryNode[] {
	const found: AsyncBoundaryNode[] = [];
	const boundaryStack: AsyncBoundaryNode[] = [];

	const visit = (node: AnyNode, conditional: boolean): void => {
		if (node.type === 'JSXTryExpression') {
			const entry: AsyncBoundaryNode = {
				node,
				nested: boundaryStack.length > 0,
				containsNested: false,
				conditional,
			};
			for (const outer of boundaryStack) outer.containsNested = true;
			found.push(entry);
			boundaryStack.push(entry);
			for (const child of childNodes(node)) visit(child, conditional);
			boundaryStack.pop();
			return;
		}
		const entersControlFlow =
			node.type === 'JSXIfExpression' ||
			node.type === 'JSXSwitchExpression' ||
			node.type === 'JSXForExpression';
		for (const child of childNodes(node)) {
			visit(child, conditional || entersControlFlow);
		}
	};

	visit(root, false);
	return found;
}

