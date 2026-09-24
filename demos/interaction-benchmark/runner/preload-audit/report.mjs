#!/usr/bin/env node
// Renders summary.md from an overpreload.mjs output directory: node runner/preload-audit/report.mjs <dir>
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.argv[2] ?? '.');
const read = (f) => (fs.existsSync(path.join(dir, f)) ? JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) : null);
const m1 = read('m1.json');
const m2 = read('m2-summary.json');
const m3 = read('m3.json');
const kb = (b) => (b == null || !Number.isFinite(b) ? '–' : (b / 1024).toFixed(1));
const pct = (f) => (f == null || !Number.isFinite(f) ? '–' : `${(100 * f).toFixed(0)}%`);
const ms = (v) => (v == null || !Number.isFinite(v) ? '–' : Math.round(v).toString());
const lines = [];
const table = (head, rows) => {
	lines.push(`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`);
	for (const r of rows) lines.push(`| ${r.join(' | ')} |`);
	lines.push('');
};

if (m1) {
	lines.push('## M1 startup over-preload', '', 'Startup = everything downloaded after load with the network idle for 1 s and no input yet. Bytes in KiB. Split of startup JS by the share of its characters that V8 block coverage saw run: at boot (before any input), only when some control on the route was exercised, or never. wire = brotli-5 body through the benchmark proxy; gzip = gzip -6 of the body.', '');
	const rows = [];
	for (const [t, routes] of Object.entries(m1))
		for (const [route, d] of Object.entries(routes)) {
			if (d.error) {
				rows.push([t, route, d.error, ...Array(10).fill('')]);
				continue;
			}
			const j = d.startupJs;
			rows.push([t, route, `${d.chunks.total}`, kb(j.wire.total), kb(j.gzip.total), kb(j.decoded.total), pct(j.decoded.boot / j.decoded.total), pct(j.decoded.control / j.decoded.total), pct(j.decoded.never / j.decoded.total), kb(j.gzip.never), `${d.chunks.never} (${kb(d.chunks.neverDecoded)})`, kb(d.nonJs.wire), kb(d.onDemandAfterInput.wire)]);
		}
	table(['entrant', 'route', 'startup JS files', 'JS wire', 'JS gzip', 'JS decoded', 'run at boot', 'run by a control only', 'never run', 'never-run gzip', 'files never run (decoded)', 'non-JS wire', 'JS fetched after input'], rows);
}

if (m2) {
	lines.push('## M2 early click on the constrained profile', '', 'Medians over visits. Times in ms from navigation start; "code ready" = last byte of every startup-or-later JS file the control executes (from M1). "needed" = the part of those files the control (plus boot) actually executes, i.e. a byte-exact closure.', '');
	const rows = m2
		.slice()
		.sort((a, b) => a.caseId.localeCompare(b.caseId) || a.target.localeCompare(b.target) || a.mode.localeCompare(b.mode))
		.map((r) => [r.caseId, r.target, r.mode, `${r.ok}/${r.visits}${r.lost ? ` (${r.lost} lost)` : ''}`, ms(r.inputMs), ms(r.requiredJsReadyMs), ms(r.requiredJsAfterInputMs), ms(r.startupJsDoneMs), ms(r.inputToResponseMs), kb(r.requiredJsWire), kb(r.neededStartupJsWire), kb(r.competingJsWireBeforeRequiredReady), kb(r.startupJsWire)]);
	table(['case', 'entrant', 'preload hints', 'answered', 'input at', 'code ready at', 'code ready - input', 'startup JS done at', 'input→response', 'required JS wire', 'needed wire (byte-exact)', 'other JS done before code ready', 'startup JS wire'], rows);
}

if (m3) {
	lines.push('## M3 navigation from /', '', 'Hover the nav link for 300 ms, click, wait for the destination and 1 s of network idle. KiB decoded unless noted.', '');
	const rows = [];
	for (const [t, dests] of Object.entries(m3))
		for (const [dest, reps] of Object.entries(dests)) {
			const r = reps.find((x) => x.ok);
			if (!r) {
				rows.push([t, dest, reps[0]?.error ?? 'failed', '', '', '', '', '', '']);
				continue;
			}
			const { startup: s, hover: h, click: c } = r.phases;
			const navJs = h.jsDecoded + c.jsDecoded;
			rows.push([t, dest, kb(s.jsDecoded), kb(s.jsExecutedOnNavDecoded), kb(h.wire), kb(c.wire), kb(navJs), pct(navJs ? (h.jsExecutedOnNavDecoded + c.jsExecutedOnNavDecoded) / navJs : null), kb(s.jsNeverDecoded)]);
		}
	table(['entrant', 'destination', 'startup JS', 'startup JS first run by the navigation', 'hover fetch (wire)', 'after-click fetch (wire)', 'JS fetched for the navigation', 'of which run', 'startup JS still never run'], rows);
}

fs.writeFileSync(path.join(dir, 'summary.md'), `# Over-preload report\n\n${lines.join('\n')}`);
console.log(path.join(dir, 'summary.md'));
