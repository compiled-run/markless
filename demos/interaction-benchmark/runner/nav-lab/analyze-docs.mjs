// Summarize docs-lab.mjs output per entrant x browser x profile x mode: click-to-paint p50/p75, document
// loads, layout shift outside recent input, sidebar/outline movement, head correctness, history.
// usage: node analyze-docs.mjs out.md a.jsonl [b.jsonl ...]
import fs from 'node:fs';

const [outPath, ...inputs] = process.argv.slice(2);
const records = inputs.flatMap((file) =>
	fs
		.readFileSync(file, 'utf8')
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line)),
);
const quantile = (values, q) => {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const at = (sorted.length - 1) * q;
	const low = Math.floor(at);
	return sorted[low] + (sorted[Math.min(low + 1, sorted.length - 1)] - sorted[low]) * (at - low);
};
const fmt = (v) => (v == null ? '–' : Math.round(v));
const moved = (a, b) =>
	a && b ? Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.w - b.w) : 0;

const cells = new Map();
for (const rec of records) {
	const key = [rec.entrant, rec.browser, rec.profile, rec.mode].join('|');
	let cell = cells.get(key);
	if (!cell)
		cells.set(
			key,
			(cell = {
				paint: [],
				docLoads: 0,
				navs: 0,
				cls: [],
				sidebarMoves: 0,
				outlineMoves: 0,
				headOk: 0,
				back: 0,
				forward: 0,
				sessions: 0,
				failures: 0,
				fragments: 0,
			}),
		);
	cell.sessions += 1;
	if (rec.failure) {
		cell.failures += 1;
		continue;
	}
	for (const nav of rec.navs) {
		cell.navs += 1;
		if (nav.clickEpoch && nav.paintEpoch) cell.paint.push(nav.paintEpoch - nav.clickEpoch);
		if (!nav.same || nav.docRequests.length) cell.docLoads += 1;
		if (nav.cls != null) cell.cls.push(nav.cls);
		if (moved(nav.before.sidebar, nav.after.sidebar) > 0) cell.sidebarMoves += 1;
		if (
			moved(nav.before.outline, nav.after.outline) > 0 &&
			nav.before.outline?.y !== nav.after.outline?.y
		)
			cell.outlineMoves += 1;
		if (nav.after.canonical?.endsWith(nav.to) && nav.after.descriptions === 1) cell.headOk += 1;
		cell.fragments += nav.fragmentRequests.length;
	}
	if (rec.back?.chrome?.canonical) cell.back += 1;
	if (rec.forward && Math.abs(rec.forward.scrollY - rec.forward.expected) <= 5) cell.forward += 1;
}
const rows = [...cells]
	.sort(([a], [b]) => a.localeCompare(b))
	.map(([key, c]) => {
		const [entrant, browser, profile, mode] = key.split('|');
		const ok = c.sessions - c.failures;
		return `| ${entrant} | ${browser} | ${profile} | ${mode} | ${fmt(quantile(c.paint, 0.5))} / ${fmt(quantile(c.paint, 0.75))} (${c.paint.length}) | ${c.docLoads}/${c.navs} | ${c.cls.length ? Math.max(...c.cls).toFixed(3) : '–'} | ${c.sidebarMoves}/${c.navs} | ${c.headOk}/${c.navs} | ${c.navs ? (c.fragments / c.navs).toFixed(1) : '–'} | ${c.back}/${ok} | ${c.forward}/${ok} | ${c.failures} |`;
	});
const table = [
	'| entrant | browser | profile | mode | click to paint p50/p75 (n) | document loads | max CLS per nav | sidebar moved | head right | fragment fetches per nav | back same page | forward scroll kept | failed |',
	'| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
	...rows,
].join('\n');
fs.writeFileSync(outPath, table + '\n');
console.log(table);
