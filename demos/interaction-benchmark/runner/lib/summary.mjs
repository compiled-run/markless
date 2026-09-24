import { describe } from './stats.mjs';

const METRICS = [
	['inputToResponseMs', (r) => r.timings.inputToResponseMs],
	['inputToDomMs', (r) => r.timings.inputToDomMs],
	['navToResponseMs', (r) => r.timings.navToResponseMs],
	['pendingMs', (r) => r.timings.pendingMs],
	['serverMs', (r) => r.timings.serverMs],
	['eventDurationMs', (r) => r.timings.eventDurationMs],
	['fcp', (r) => r.timings.fcp],
	['lcp', (r) => r.timings.lcp],
	['longTaskTotalMs', (r) => r.timings.longTasks.totalMs],
	['compressedJs', (r) => r.bytes.compressedJs],
	['decodedJs', (r) => r.bytes.decodedJs],
	['htmlCompressed', (r) => r.bytes.html.compressed],
	['initialRequests', (r) => r.requests.initial],
	['perActionRequests', (r) => r.requests.perAction],
];

export const profileLabel = (p) => (p.cpu.slowdown === 1 && p.network.latencyMs === null ? 'normal' : `${p.network.name}+${p.cpu.name}`);
export const cellKey = (r) => [r.framework.entrant, r.framework.variant, r.browser.name, profileLabel(r.profile), r.caseId, r.phase].join('|');

export function summarize(results) {
	const cells = new Map();
	for (const r of results) {
		const key = cellKey(r);
		if (!cells.has(key)) cells.set(key, { entrant: r.framework.entrant, variant: r.framework.variant, browser: r.browser.name, profile: key.split('|')[3], caseId: r.caseId, phase: r.phase, records: [] });
		cells.get(key).records.push(r);
	}
	return [...cells.values()].map(({ records, ...cell }) => {
		const ok = records.filter((r) => r.failure === null);
		const failures = {};
		for (const r of records) if (r.failure) failures[r.failure.kind] = (failures[r.failure.kind] ?? 0) + 1;
		const metrics = {};
		for (const [name, pick] of METRICS) {
			const d = describe(ok.map(pick));
			if (d.n) metrics[name] = d;
		}
		return { ...cell, visits: records.length, successes: ok.length, failures, metrics };
	});
}

const fmt = (v, digits = 1) => (v === null || v === undefined ? '-' : Number(v).toFixed(digits));

export function markdown(summary, meta) {
	const lines = [
		`# Interaction benchmark run ${meta.runId}`,
		'',
		`Started ${meta.started}; finished ${meta.finished}. Playwright ${meta.playwright}. Browsers: ${Object.entries(meta.browserVersions).map(([k, v]) => `${k} ${v}`).join(', ')}.`,
		`Visits per cell: ${meta.config.visits} (warmup ${meta.config.warmup}, excluded). Order alternates (rotates) across targets per visit index.`,
		'',
		'`inputToResponseMs` is a presentation estimate (rAF then next rAF after the DOM assertion holds), not a paint timestamp. `inputToDomMs` is the DOM diagnostic. Failed visits are counted, never folded into the distributions.',
		'',
		'| entrant | browser | profile | case | phase | ok/visits | failures | inputToResponse median | p95 | IQR | stddev | inputToDom median | navToResponse median | JS KB (compressed) | initial req |',
		'| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
	];
	for (const c of summary) {
		const m = c.metrics;
		const failures = Object.entries(c.failures).map(([k, v]) => `${k}:${v}`).join(' ') || '0';
		lines.push(`| ${c.entrant}${c.variant === 'default' ? '' : ` (${c.variant})`} | ${c.browser} | ${c.profile} | ${c.caseId} | ${c.phase} | ${c.successes}/${c.visits} | ${failures} | ${fmt(m.inputToResponseMs?.median)} | ${fmt(m.inputToResponseMs?.p95)} | ${fmt(m.inputToResponseMs?.iqr)} | ${fmt(m.inputToResponseMs?.stddev)} | ${fmt(m.inputToDomMs?.median)} | ${fmt(m.navToResponseMs?.median)} | ${fmt(m.compressedJs ? m.compressedJs.median / 1024 : null)} | ${fmt(m.initialRequests?.median, 0)} |`);
	}
	return lines.join('\n') + '\n';
}
