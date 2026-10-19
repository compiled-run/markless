// Prints measure-apps.mjs results as a markdown table; with two files, as before -> after.
// usage: node scripts/benchmarks/resume-data/table.mjs <results.json> [<after.json>]
import { readFileSync } from 'node:fs';

const [beforeFile, afterFile] = process.argv.slice(2);
const before = JSON.parse(readFileSync(beforeFile, 'utf8'));
const after = afterFile ? JSON.parse(readFileSync(afterFile, 'utf8')) : undefined;
const kb = (bytes) => (bytes / 1000).toFixed(1);
const pair = (value) => `${kb(value.raw)} / ${kb(value.gzip)}`;
const cell = (pick, b, a) => (a ? `${pick(b)} -> ${pick(a)}` : pick(b));

console.log(
	'| App | Page | HTML kB (raw / gzip) | Resume data kB (raw / gzip) | JS downloaded at load kB (raw / gzip) | JS executed at load (bytes) |',
);
console.log('| --- | --- | --- | --- | --- | --- |');
for (const [app, routes] of Object.entries(before))
	for (const [route, b] of Object.entries(routes)) {
		const a = after?.[app]?.[route];
		console.log(
			`| ${app} | \`${route}\` | ${cell((m) => pair(m.html), b, a)} | ${cell((m) => pair(m.resumeData.total), b, a)} | ${cell((m) => pair(m.jsDownloadedAtLoad), b, a)} | ${cell((m) => String(m.jsExecutedAtLoad.bytes), b, a)} |`,
		);
	}
