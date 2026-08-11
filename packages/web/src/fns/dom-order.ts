// Shares the root's census slot with resume-locators by name, not by import:
// an edge between the wake and resume chunks regroups the wall-counted graph.
export const marklessFindElementAtDomOrderIndex = (
	r: Element & { __marklessCensus?: Node[] },
	i: number,
) => {
	let c = r.__marklessCensus;
	if (!c) {
		const w = document.createTreeWalker(r, 1);
		c = r.__marklessCensus = r.nodeType === 1 ? [r] : [];
		for (let n: Node | null; (n = w.nextNode()); ) c.push(n);
	}
	return c[i];
};
