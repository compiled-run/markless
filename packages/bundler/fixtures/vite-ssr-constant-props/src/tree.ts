export interface TreeNode {
	id: string;
	label: string;
	children?: readonly TreeNode[];
}

export const TREE: readonly TreeNode[] = [
	{
		id: 'guides',
		label: 'Guides',
		children: [
			{ id: 'start', label: 'Getting started' },
			{ id: 'deploy', label: 'Deploying' },
		],
	},
	{
		id: 'reference',
		label: 'Reference',
		children: [
			{ id: 'api', label: 'API' },
			{ id: 'cli', label: 'CLI' },
		],
	},
];

export function leafCount(node: TreeNode): number {
	return node.children?.length ?? 0;
}
