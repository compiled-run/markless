import {
	PROTOCOL_CONTAINER_END_COMMENT,
	PROTOCOL_CONTAINER_START_COMMENT,
} from '../../../serializer/src/protocol-page-markers.ts';

// Shares the root's census slot with resume-locators by name, not by import:
// an edge between the wake and resume chunks regroups the wall-counted graph.
export const marklessFindElementAtDomOrderIndex = (
	r: Element & { __marklessCensus?: Node[] },
	i: number,
) => {
	let c = r.__marklessCensus;
	if (!c) {
		const w = document.createTreeWalker(r, 129);
		c = r.__marklessCensus = r.nodeType === 1 ? [r] : [];
		for (let n: Node | null; (n = w.nextNode());)
			if (n.nodeType !== 8) c.push(n);
			else if ((n as Comment).data === PROTOCOL_CONTAINER_START_COMMENT) c.length = 1;
			else if ((n as Comment).data === PROTOCOL_CONTAINER_END_COMMENT) break;
	}
	return c[i];
};
