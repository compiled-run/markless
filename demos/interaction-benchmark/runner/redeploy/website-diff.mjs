// Usage: node website-diff.mjs <outDir> <before> <after>: re-downloaded gzip bytes per docs route.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const [outDir, ...labels] = process.argv.slice(2);
const [a, b] = labels.map((l) => JSON.parse(readFileSync(join(outDir, `${l}.json`), 'utf8')));
const out = {};
for (const [route, urls] of Object.entries(b.routes)) {
	const have = urls.filter((u) => b.files[u]);
	const redl = have.filter((u) => !a.files[u] || a.files[u].sha !== b.files[u].sha);
	out[route] =
		`${(redl.reduce((s, u) => s + b.files[u].gz, 0) / 1000).toFixed(1)} of ${(have.reduce((s, u) => s + b.files[u].gz, 0) / 1000).toFixed(1)} KB, ${redl.length}/${have.length} files`;
}
const changed = Object.keys(b.files).filter(
	(k) => !a.files[k] || a.files[k].sha !== b.files[k].sha,
);
const same = Object.keys(b.files).filter((k) => a.files[k] && a.files[k].sha !== b.files[k].sha);
console.log(JSON.stringify(out), 'changed files', changed.length, 'same-name', same.length);
