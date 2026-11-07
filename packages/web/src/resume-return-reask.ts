import type { ResumeAsyncBoundaryRecord } from './resume-types.ts';

// On a container shown again as it was left: true until its runtime wires, then the call that re-asks its async values.
export const CONTAINER_REASK_PROPERTY = '__mReask';

type Reask = () => void;
type Host = { [CONTAINER_REASK_PROPERTY]?: true | Reask };
type Graph = {
	readonly asyncPlane?: () => { readonly rerun: (graphNodeId: string, revalidate?: boolean) => boolean } | undefined;
};

// A back-forward cache restore re-asks here; the router and the page's inline script mark a page shown again before its runtime wires.
export function reaskOnReturn(
	root: object,
	graph: Graph,
	boundaries: ReadonlyMap<string, Pick<ResumeAsyncBoundaryRecord, 'asyncReads'>>,
): () => void {
	const host = root as Host;
	const reask = () => {
		const ids = new Set<string>();
		for (const boundary of boundaries.values())
			for (const read of boundary.asyncReads) ids.add(read.graphNodeId);
		for (const id of ids) graph.asyncPlane?.()?.rerun(id, true);
	};
	const restored = (event: Event) => (event as PageTransitionEvent).persisted && reask();
	if (host[CONTAINER_REASK_PROPERTY] === true) reask();
	host[CONTAINER_REASK_PROPERTY] = reask;
	globalThis.addEventListener?.('pageshow', restored);
	return () => {
		globalThis.removeEventListener?.('pageshow', restored);
		if (host[CONTAINER_REASK_PROPERTY] === reask) delete host[CONTAINER_REASK_PROPERTY];
	};
}
