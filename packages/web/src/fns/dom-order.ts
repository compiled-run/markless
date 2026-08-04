export const marklessFindElementAtDomOrderIndex = (r, i) => {
	const w = document.createTreeWalker(r, 1);
	let n = r.nodeType === 1 ? r : w.nextNode();
	for (; i-- && n; ) n = w.nextNode();
	return n;
};
