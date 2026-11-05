import type {
	ResumeArmRange,
	ResumeArmRecordSet,
	ResumeAsyncBoundaryRecord,
	ResumeDomComment,
	ResumeDomElement,
} from './resume-types.ts';

type BusyNode = {
	readonly nodeType?: number;
	readonly isConnected?: boolean;
	readonly textContent?: string | null;
	readonly parentNode?: BusyParent | null;
	setAttribute?: (name: string, value: string) => void;
	removeAttribute?: (name: string) => void;
};
type BusyParent = BusyNode & { readonly childNodes: ArrayLike<BusyNode> };
type BusyBoundary = Pick<ResumeAsyncBoundaryRecord, 'startAnchor' | 'endAnchor' | 'asyncSources'>;
type BoundaryBusy = {
	boundary?: BusyBoundary;
	readonly pending: Set<string>;
	marked: Set<BusyNode>;
};

const bindingsByRange = new WeakMap<object, ReadonlyArray<readonly [BusyNode, string]>>();
const busyByRange = new WeakMap<object, BoundaryBusy>();
const afterByEnd = new WeakMap<object, BusyNode>();

// A failed refresh's @catch drawn after the kept content: a retry marks it busy as a whole.
export function rememberAfterRange(endAnchor: object, startAnchor: ResumeDomComment): void {
	afterByEnd.set(endAnchor, startAnchor as unknown as BusyNode);
}

// The shown arm's bindings as its records name them: each DOM update and keyed list host with the graph node it reads.
export function rememberArmBindings(
	range: Pick<ResumeArmRange, 'startAnchor'>,
	materialized: {
		readonly elementsByHostId: ReadonlyMap<string, ResumeDomElement>;
		readonly domUpdates: NonNullable<ResumeArmRecordSet['domUpdates']>;
		readonly keyedRepeats: NonNullable<ResumeArmRecordSet['keyedRepeats']>;
	},
): void {
	if (typeof range.startAnchor !== 'object' || !range.startAnchor) return;
	const bindings: Array<readonly [BusyNode, string]> = [];
	for (const [hostNodeId, graphNodeId] of [
		...materialized.domUpdates.map((update) => [update.hostNodeId, update.graphNodeId]),
		...materialized.keyedRepeats.map((repeat) => [
			repeat.parentHostNodeId,
			repeat.collectionGraphNodeId,
		]),
	]) {
		const host = materialized.elementsByHostId.get(hostNodeId!);
		if (host && graphNodeId) bindings.push([host as BusyNode, graphNodeId]);
	}
	bindingsByRange.set(range.startAnchor, bindings);
	const boundary = busyByRange.get(range.startAnchor)?.boundary;
	if (boundary) applyBusy(boundary);
}

// Marks follow the reads still running while the block shows settled content; a first load marks nothing.
export function noteBoundaryReadStatus(
	boundary: BusyBoundary,
	graphNodeId: string,
	snapshot: unknown,
	showsSettledContent: boolean,
): void {
	const status = (snapshot as { readonly status?: unknown } | null)?.status;
	const busy = busyOf(boundary);
	if (status === 'pending' && showsSettledContent) busy.pending.add(graphNodeId);
	else if (status !== 'fulfilled' && status !== 'rejected') return;
	// The last read to settle clears with the settle commit that shows it, not before.
	else if (!busy.pending.delete(graphNodeId) || busy.pending.size === 0) return;
	applyBusy(boundary);
}

export function setBoundaryBusy(boundary: BusyBoundary, busy: boolean): void {
	if (!busy) busyOf(boundary).pending.clear();
	applyBusy(boundary);
}

function busyOf(boundary: BusyBoundary): BoundaryBusy {
	const key = (boundary.startAnchor as object | undefined) ?? boundary;
	let busy = busyByRange.get(key);
	if (!busy) busyByRange.set(key, (busy = { pending: new Set(), marked: new Set() }));
	busy.boundary = boundary;
	return busy;
}

export function applyBusy(boundary: BusyBoundary): void {
	const busy = busyOf(boundary);
	const hosts = new Set<BusyNode>();
	const bindings = (boundary.startAnchor && bindingsByRange.get(boundary.startAnchor)) || [];
	let unbound = false;
	for (const graphNodeId of busy.pending) {
		let bound = false;
		for (const [host, read] of bindings)
			if (
				host.isConnected !== false &&
				(read === graphNodeId || boundary.asyncSources?.[read]?.includes(graphNodeId))
			)
				bound = !!hosts.add(host);
		unbound ||= !bound;
	}
	if (unbound) for (const host of boundaryBusyHosts(boundary)) hosts.add(host);
	const after = boundary.endAnchor && afterByEnd.get(boundary.endAnchor);
	if (after?.isConnected && busy.pending.size > 0) {
		const range = {
			startAnchor: after as unknown as ResumeDomComment,
			endAnchor: boundary.endAnchor,
		};
		for (const host of boundaryBusyHosts(range)) hosts.add(host);
	}
	for (const host of busy.marked) if (!hosts.has(host)) host.removeAttribute?.('aria-busy');
	for (const host of hosts) host.setAttribute?.('aria-busy', 'true');
	busy.marked = hosts;
}

// Fallback for a read no arm record binds (bare text at the block's top level, a record-less arm): a component whose root is the block cannot see its parent at build time.
export function boundaryBusyHosts(
	boundary: Pick<ResumeArmRange, 'startAnchor' | 'endAnchor'>,
): BusyNode[] {
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
