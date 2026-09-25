#!/usr/bin/env node
// Usage: node report.mjs <outDir> [apps] -> markdown tables on stdout, summary.json in <outDir>.
// Returning visitor: cache = every asset the visitor fetched on the three routes of the previous
// deploy (load, interactions and navigation). Re-download = assets the new deploy fetches on the route
// before the network is idle (landing plus prefetch) whose URL is not cached or whose bytes changed.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { editDescriptions, EDITS } from './edits.mjs';

const out = process.argv[2];
const names = (
	process.argv[3] ??
	'markless,qwik,qwik-tuned,octane,react-router,remix3,solidstart,sveltekit,ripple'
).split(',');
const ROUTES = ['/', '/records', '/settings'];
const load = (name, label) => {
	const p = join(out, name, `${label}.json`);
	return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
};
const longLived = (cc) =>
	!!cc && !/no-cache|no-store|max-age=0\b/.test(cc) && /max-age=\d+|immutable/.test(cc);
const ASSET = /\.(m?js|css|woff2?|wasm)$/;
// Qwik answers a missing build file with an empty 200; that is as gone as a 404.
const EMPTY_SHA = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function compare(A, B) {
	const cache = new Map();
	for (const r of Object.values(A.routes))
		for (const u of Object.keys(r)) cache.set(u, A.assets[u].sha);
	const routes = {};
	const sameUrlChanged = new Set();
	const revalidating = new Set();
	for (const route of ROUTES) {
		const entries = Object.entries(B.routes[route] ?? {}).filter(
			([, v]) => v.phase === 'landing' || v.phase === 'idle',
		);
		const all = { files: entries.length, gz: 0, br: 0 };
		const redl = { files: 0, gz: 0, br: 0 };
		for (const [u, v] of entries) {
			const s = B.assets[u];
			all.gz += s.gz;
			all.br += s.br;
			if (!longLived(v.cacheControl)) revalidating.add(u);
			const changed = !cache.has(u) || cache.get(u) !== s.sha;
			if (cache.has(u) && cache.get(u) !== s.sha && longLived(v.cacheControl))
				sameUrlChanged.add(u);
			if (changed) {
				redl.files++;
				redl.gz += s.gz;
				redl.br += s.br;
			}
		}
		routes[route] = { all, redl };
	}
	// Skew: an open tab from deploy A needs these after load (interactions, client navigation).
	const lazy = new Set();
	for (const r of Object.values(A.routes))
		for (const [u, v] of Object.entries(r))
			if (v.phase === 'interact' || v.phase === 'nav') lazy.add(u);
	const allOld = new Set(Object.values(A.routes).flatMap((r) => Object.keys(r)));
	const missing = (set) =>
		[...set].filter(
			(u) =>
				!B.probe[u] ||
				B.probe[u].status !== 200 ||
				B.probe[u].html ||
				B.probe[u].sha === EMPTY_SHA,
		);
	const mismatched = (set) =>
		[...set].filter(
			(u) =>
				B.probe[u]?.status === 200 &&
				!B.probe[u].html &&
				B.probe[u].sha !== A.assets[u].sha,
		);
	let build = null;
	if (A.staticFiles && B.staticFiles) {
		const assetKeys = (m) => Object.keys(m).filter((k) => ASSET.test(k));
		const added = assetKeys(B.staticFiles).filter((k) => !A.staticFiles[k]);
		const same = assetKeys(B.staticFiles).filter(
			(k) => A.staticFiles[k] && A.staticFiles[k].sha !== B.staticFiles[k].sha,
		);
		const anyChanged = Object.keys(B.staticFiles).filter(
			(k) => !A.staticFiles[k] || A.staticFiles[k].sha !== B.staticFiles[k].sha,
		).length;
		build = {
			assetFiles: assetKeys(B.staticFiles).length,
			changedAssets: added.length + same.length,
			changedAssetsGz: [...added, ...same].reduce((s, k) => s + B.staticFiles[k].gz, 0),
			sameNameChanged: same,
			removedAssets: assetKeys(A.staticFiles).filter((k) => !B.staticFiles[k]).length,
			anyFileChanged: anyChanged,
		};
	} else {
		const oldSet = new Set(Object.keys(A.assets));
		const newSet = Object.keys(B.assets);
		const changed = newSet.filter((u) => !oldSet.has(u) || A.assets[u].sha !== B.assets[u].sha);
		build = {
			assetFiles: newSet.length,
			changedAssets: changed.length,
			changedAssetsGz: changed.reduce((s, u) => s + B.assets[u].gz, 0),
			sameNameChanged: [],
			removedAssets: [...oldSet].filter((u) => !B.assets[u]).length,
			anyFileChanged: null,
			fromCapture: true,
		};
	}
	return {
		routes,
		sameUrlChanged: [...sameUrlChanged],
		revalidatingAtLoad: revalidating.size,
		skew: {
			lazyNeeded: lazy.size,
			lazyMissing: missing(lazy).length,
			lazyMismatched: mismatched(lazy).length,
			anyOldMissing: missing(allOld).length,
			oldFiles: allOld.size,
		},
		build,
		errors: B.errors,
	};
}

const summary = {};
const kb = (n) => (n / 1000).toFixed(1);
for (const name of names) {
	const A = load(name, 'base1');
	if (!A) continue;
	summary[name] = {};
	const B2 = load(name, 'base2');
	if (B2) summary[name].base2 = compare(A, B2);
	for (const e of EDITS) {
		const B = load(name, e);
		if (B) summary[name][e] = compare(A, B);
	}
}
writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 1));

const lines = [];
lines.push('### Determinism (two clean builds of the unchanged tree)\n');
lines.push(
	'| entrant | asset files | changed assets | any static file changed | load-set re-download (/ , /records, /settings) |',
);
lines.push('|---|---|---|---|---|');
for (const [name, s] of Object.entries(summary)) {
	const b = s.base2;
	if (!b) continue;
	lines.push(
		`| ${name} | ${b.build.assetFiles} | ${b.build.changedAssets} | ${b.build.anyFileChanged ?? 'n/a'} | ${ROUTES.map((r) => b.routes[r].redl.files).join(', ')} |`,
	);
}
for (const e of EDITS) {
	lines.push(`\n### ${e}: ${editDescriptions[e]}\n`);
	lines.push(
		'| rank | entrant | / | /records | /settings | sum gz KB (brotli) | route load gz KB (/, /records, /settings) | changed assets in build (gz KB) | same-URL changed, long-lived cache | open tab: lazy files 404 / needed | old files gone | revalidated at load |',
	);
	lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
	const rows = Object.entries(summary)
		.filter(([, s]) => s[e])
		.map(([name, s]) => ({
			name,
			r: s[e],
			sum: ROUTES.reduce((t, x) => t + s[e].routes[x].redl.gz, 0),
			sumBr: ROUTES.reduce((t, x) => t + s[e].routes[x].redl.br, 0),
			files: ROUTES.reduce((t, x) => t + s[e].routes[x].redl.files, 0),
		}));
	rows.sort((a, b) => a.sum - b.sum || a.files - b.files);
	rows.forEach(({ name, r, sum, sumBr }, i) => {
		const cell = (x) => `${kb(r.routes[x].redl.gz)} / ${r.routes[x].redl.files}`;
		lines.push(
			`| ${i + 1} | ${name} | ${cell('/')} | ${cell('/records')} | ${cell('/settings')} | ${kb(sum)} (${kb(sumBr)}) | ${ROUTES.map((x) => kb(r.routes[x].all.gz)).join(', ')} | ${r.build.changedAssets} of ${r.build.assetFiles} (${kb(r.build.changedAssetsGz)}) | ${r.sameUrlChanged.length ? `**${r.sameUrlChanged.length}**` : 0} | ${r.skew.lazyMissing} / ${r.skew.lazyNeeded} | ${r.skew.anyOldMissing} of ${r.skew.oldFiles} | ${r.revalidatingAtLoad} |`,
		);
	});
}
lines.push(
	'\n### Navigation mode (document loads during the three navigations of each route visit)\n',
);
lines.push('| entrant | / | /records | /settings |');
lines.push('|---|---|---|---|');
for (const name of Object.keys(summary)) {
	const A = load(name, 'base1');
	if (A.navigation)
		lines.push(`| ${name} | ${ROUTES.map((r) => A.navigation[r].documents).join(' | ')} |`);
}
console.log(lines.join('\n'));
