// Summarize lab.mjs output: per entrant x browser x profile x mode, click-to-paint p50/p75 for first and
// later navigations, share of navigations with nothing to fetch at the click, unused speculative bytes
// and requests per page view.
// usage: node analyze.mjs reference.json out.md a.jsonl [b.jsonl ...]
import fs from 'node:fs';

const [referencePath, outPath, ...inputs] = process.argv.slice(2);
const reference = JSON.parse(fs.readFileSync(referencePath, 'utf8'));
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

// A navigation had nothing to fetch at the click when no request was in flight at the click or started
// between the click and the destination paint.
function nothingAtClick(rec, nav) {
	if (nav.back || !nav.click?.click || !nav.paintEpoch) return null;
	if (Array.isArray(nav.late)) return nav.late.length === 0;
	const click = nav.click.click;
	const paint = nav.paintEpoch;
	return !rec.requests.some((r) => r.startEpoch < paint && (r.endEpoch ?? Infinity) > click);
}

// Speculative bytes: requests started after the landing's load event. Used when the page the session
// showed needs them on a cold landing, when they are that page's HTML or fragment, or when they ran.
function unusedBytes(rec) {
	const shown = new Set(rec.views ?? []);
	const needed = new Set();
	for (const view of shown)
		for (const path of reference[rec.entrant]?.[view] ?? []) needed.add(path);
	const evaluated = new Set(rec.evaluated ?? []);
	let unused = 0;
	for (const r of rec.requests) {
		if (!rec.loadEpoch || r.startEpoch < rec.loadEpoch) continue;
		const path = r.path.split('?')[0];
		const html = r.type.includes('html');
		if (html && shown.has(path)) continue;
		if (!html && (needed.has(path) || evaluated.has(path))) continue;
		if (
			/data\.json|__data/.test(path) &&
			[...shown].some((v) => path.startsWith(v === '/' ? '/__data' : v))
		)
			continue;
		unused += r.br ?? 0;
	}
	return unused;
}

const cells = new Map();
for (const rec of records) {
	const key = [rec.entrant, rec.browser, rec.profile, rec.mode].join('|');
	let cell = cells.get(key);
	if (!cell)
		cells.set(
			key,
			(cell = {
				first: [],
				later: [],
				back: [],
				nothing: [],
				unused: 0,
				requests: 0,
				views: 0,
				sessions: 0,
				failures: 0,
				leads: [],
				errors: 0,
			}),
		);
	cell.sessions += 1;
	if (rec.failure) {
		cell.failures += 1;
		continue;
	}
	if (rec.errors?.length) cell.errors += 1;
	const views = (rec.views ?? []).length;
	cell.views += views;
	cell.requests += rec.requests.filter(
		(r) => !rec.loadEpoch || r.startEpoch >= rec.sessionStart,
	).length;
	cell.unused += unusedBytes(rec);
	for (const [index, nav] of rec.navs.entries()) {
		if (nav.back) {
			cell.back.push(nav.clickToPaint);
			continue;
		}
		(index === 0 ? cell.first : cell.later).push(nav.clickToPaint);
		const nothing = nothingAtClick(rec, nav);
		if (nothing != null) cell.nothing.push(nothing);
		if (nav.lead != null) cell.leads.push(nav.lead);
	}
}

const rows = [];
for (const [key, c] of [...cells].sort(([a], [b]) => a.localeCompare(b))) {
	const [entrant, browser, profile, mode] = key.split('|');
	const share = c.nothing.length
		? `${Math.round((100 * c.nothing.filter(Boolean).length) / c.nothing.length)}%`
		: '–';
	rows.push(
		`| ${entrant} | ${browser} | ${profile} | ${mode} | ${fmt(quantile(c.first, 0.5))} / ${fmt(quantile(c.first, 0.75))} (${c.first.length}) | ${fmt(quantile(c.later, 0.5))} / ${fmt(quantile(c.later, 0.75))} (${c.later.length}) | ${fmt(quantile(c.back, 0.5))} | ${share} | ${c.views ? (c.unused / 1024 / c.views).toFixed(1) : '–'} | ${c.views ? (c.requests / c.views).toFixed(1) : '–'} | ${fmt(quantile(c.leads, 0.5))} | ${c.sessions} | ${c.failures} | ${c.errors} |`,
	);
}
const table = [
	'| entrant | browser | profile | mode | first p50/p75 (n) | later p50/p75 (n) | back p50 | nothing at click | unused KB/view | req/view | lead p50 | sessions | failed | with errors |',
	'| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
	...rows,
].join('\n');
fs.writeFileSync(outPath, table + '\n');
console.log(table);
