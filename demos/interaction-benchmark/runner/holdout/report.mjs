#!/usr/bin/env node
// Markdown summary of a holdout run: `node report.mjs <dir>` rewrites <dir>/summary.md and summary.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregate } from './lib/metrics.mjs';

const fmt = (v, digits = 0) =>
	v === null || v === undefined || Number.isNaN(v) ? '-' : Number(v).toFixed(digits);

export function markdown(rows, meta = {}) {
	const lines = [`# Holdout lane: ${meta.date ?? ''}`, ''];
	if (meta.revision)
		lines.push(
			`Source: \`${meta.revision}\`. Browsers: ${meta.browsers?.join(', ')}. Profiles: ${meta.profiles?.join(', ')}.`,
			'',
		);
	lines.push(
		'Columns: load requests / wire KB (brotli via the runner proxy) / JS files at load (preloaded, preloaded but never executed at load) / V8 characters executed at load (Chromium) / first contentful paint / early clicks that survived out of those with an observable response (lost) and their median input-to-response ms / settled first click input-to-response median ms / JS fetched by first clicks (requests, KB, summed over controls) / internal-link navigations: median serial request rounds and input-to-URL-response ms.',
		'',
	);
	const lanes = [...new Set(rows.map((r) => r.lane))];
	for (const lane of lanes) {
		const info = meta.lanes?.[lane];
		lines.push(`## ${lane}`, '');
		if (info)
			lines.push(
				`${info.rendering}. Routes: ${info.routes.map((r) => `\`${r}\``).join(', ')}.`,
				'',
			);
		lines.push(
			'| variant | browser | profile | load req | load KB | JS files (pre / unused) | exec chars | FCP ms | early survived (lost) | early click ms | first click ms | click JS req / KB | nav rounds | nav ms |',
			'| --- | --- | --- | ---: | ---: | --- | ---: | ---: | --- | ---: | ---: | --- | ---: | ---: |',
		);
		for (const r of rows.filter((x) => x.lane === lane)) {
			lines.push(
				`| ${r.variant} | ${r.browser} | ${r.profile} | ${fmt(r.load.requests)} | ${fmt(r.load.wireKB, 1)} | ${fmt(r.load.jsFiles)} (${fmt(r.load.preloaded)} / ${fmt(r.load.preloadedUnused)}) | ${fmt(r.load.executedChars)} | ${fmt(r.load.fcpMs)} | ${r.early.survived}/${r.early.counted} (${r.early.lost}) | ${fmt(r.early.inputToResponseMs, 1)} | ${fmt(r.firstClick.inputToResponseMs, 1)} | ${r.firstClick.clickJsRequests} / ${fmt(r.firstClick.clickJsKB, 1)} | ${fmt(r.nav.rounds)} | ${fmt(r.nav.latencyMs, 0)} |`,
			);
		}
		lines.push('');
	}
	if (meta.notes?.length) lines.push('## Notes', '', ...meta.notes.map((n) => `- ${n}`), '');
	return lines.join('\n');
}

export function readRecords(dir) {
	const file = path.join(dir, 'records.jsonl');
	return fs.existsSync(file)
		? fs
				.readFileSync(file, 'utf8')
				.split('\n')
				.filter(Boolean)
				.map((l) => JSON.parse(l))
		: [];
}

export function writeReport(dir, meta) {
	const rows = aggregate(readRecords(dir));
	fs.writeFileSync(path.join(dir, 'summary.json'), `${JSON.stringify(rows, null, '\t')}\n`);
	fs.writeFileSync(path.join(dir, 'summary.md'), markdown(rows, meta));
	return rows;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
	const dir = process.argv[2];
	if (!dir) {
		console.error('usage: node report.mjs <holdout result dir>');
		process.exit(2);
	}
	const runFile = path.join(dir, 'run.json');
	const meta = fs.existsSync(runFile) ? JSON.parse(fs.readFileSync(runFile, 'utf8')) : {};
	writeReport(dir, meta);
	console.log(fs.readFileSync(path.join(dir, 'summary.md'), 'utf8'));
}
