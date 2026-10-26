import type { ResumeArmRange } from './resume-types.ts';

type BusyNode = {
	readonly nodeType?: number;
	readonly textContent?: string | null;
	readonly parentNode?: BusyParent | null;
	setAttribute?: (name: string, value: string) => void;
	removeAttribute?: (name: string) => void;
};
type BusyParent = BusyNode & { readonly childNodes: ArrayLike<BusyNode> };

// Decided at runtime because a component whose root is the block cannot see its parent at build time.
export function boundaryBusyHosts(boundary: Pick<ResumeArmRange, 'startAnchor' | 'endAnchor'>): BusyNode[] {
	const start = boundary.startAnchor as unknown as BusyNode;
	const parent = start?.parentNode;
	if (!parent) return [];
	const siblings = Array.from(parent.childNodes);
	const from = siblings.indexOf(start);
	const to = siblings.indexOf(boundary.endAnchor as unknown as BusyNode);
	if (from === -1 || to <= from) return [];
	const shown = (node: BusyNode) =>
		node.nodeType === 1 || (node.nodeType === 3 && (node.textContent ?? '').trim() !== '');
	const outside = siblings.some((node, at) => (at < from || at > to) && shown(node));
	if (!outside && parent.nodeType === 1) return [parent];
	return siblings.slice(from + 1, to).filter((node) => node.nodeType === 1);
}

export function setBoundaryBusy(
	boundary: Pick<ResumeArmRange, 'startAnchor' | 'endAnchor'>,
	busy: boolean,
): void {
	for (const host of boundaryBusyHosts(boundary)) {
		if (busy) host.setAttribute?.('aria-busy', 'true');
		else host.removeAttribute?.('aria-busy');
	}
}
