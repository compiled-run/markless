const e = (c, s) => {
	throw Object.assign(
		Error(c),
		{ code: c, site: s },
		c === 'MARKLESS_PAYLOAD_INVALID'
			? { docsUrl: 'https://markless.dev/errors/MARKLESS_PAYLOAD_INVALID' }
			: {},
	);
};
export const marklessFindElementAtDomOrderIndex = (r, i) => {
	const w = document.createTreeWalker(r, 1);
	let n = r.nodeType === 1 ? r : w.nextNode();
	for (; i-- && n; ) n = w.nextNode();
	return n;
};
export const marklessReadScalarCell = (r, graphNodeId) => {
	const script = r.querySelector('script[type="markless/state"]');
	if (!script) return;
	try {
		return JSON.parse(script.textContent || 'null')?.cells?.find(
			(cell) => cell?.graphNodeId === graphNodeId,
		);
	} catch {}
};
export const marklessDecodeScalarCell = (c, g, s) => {
	try {
		const v = c?.value,
			r = v?.root;
		if (
			!c ||
			c.graphNodeId !== g ||
			c.valueKind !== 'scalar' ||
			v?.version !== 1 ||
			v.records?.length !== 0
		)
			e('MARKLESS_PAYLOAD_INVALID', s);
		if (r == null || typeof r !== 'object') return r;
		if (r.$type === 'undefined') return undefined;
		if (r.$type === 'bigint') return BigInt(r.value);
		if (r.$type === 'date') {
			const d = new Date(r.value);
			if (!Number.isNaN(d.getTime())) return d;
		}
	} catch {}
	e('MARKLESS_PAYLOAD_INVALID', s);
};
export { e as marklessScalarSpecializedError };
