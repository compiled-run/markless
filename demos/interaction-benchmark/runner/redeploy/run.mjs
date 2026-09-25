#!/usr/bin/env node
// Usage: node run.mjs --out <dir> --apps a,b --labels base1,base2,e1,...
// Each label is a clean production build (edit applied for e*), then a capture and a static-dir manifest.
import { spawnSync } from 'node:child_process';
import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { apps, appsDir } from './apps.mjs';
import { captureApp, sizes } from './capture.mjs';
import { applyEdit } from './edits.mjs';

const args = Object.fromEntries(
	process.argv
		.slice(2)
		.reduce(
			(acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc),
			[],
		),
);
const out = args.out;
const names = args.apps.split(',');
const labels = args.labels.split(',');

function manifest(dir) {
	const files = {};
	if (!dir || !existsSync(dir)) return null;
	(function walk(d) {
		for (const e of readdirSync(d)) {
			const p = join(d, e);
			if (statSync(p).isDirectory()) walk(p);
			else files['/' + relative(dir, p)] = sizes(readFileSync(p));
		}
	})(dir);
	return files;
}

for (const name of names) {
	const app = apps[name];
	const dir = join(appsDir, name);
	mkdirSync(join(out, name), { recursive: true });
	for (const label of labels) {
		for (const c of app.clean) rmSync(join(dir, c), { recursive: true, force: true });
		const restore = label.startsWith('e') ? applyEdit(name, label) : () => {};
		try {
			const started = Date.now();
			for (const [cmd, cmdArgs] of app.build) {
				const r = spawnSync(cmd, cmdArgs, {
					cwd: dir,
					env: { ...process.env, BENCHMARK_BUILD_ID: 't180' },
					encoding: 'utf8',
					maxBuffer: 1 << 28,
				});
				writeFileSync(
					`/private/tmp/t180/logs/build-${name}-${label}.log`,
					`${r.stdout}\n${r.stderr}`,
					{ flag: 'a' },
				);
				if (r.status !== 0)
					throw new Error(
						`build failed ${name} ${label}: ${(r.stderr || r.stdout).slice(-1500)}`,
					);
			}
			const buildMs = Date.now() - started;
			const basePath = join(out, name, 'base1.json');
			const probeUrls =
				label !== 'base1' && existsSync(basePath)
					? [
							...new Set(
								Object.values(
									JSON.parse(readFileSync(basePath, 'utf8')).routes,
								).flatMap((r) => Object.keys(r)),
							),
						]
					: [];
			const capture = await captureApp(name, { probeUrls });
			const staticFiles = manifest(app.staticDir && join(dir, app.staticDir));
			if (args.keep && app.staticDir)
				cpSync(join(dir, app.staticDir), join(out, name, `${label}-static`), {
					recursive: true,
				});
			writeFileSync(
				join(out, name, `${label}.json`),
				JSON.stringify({ app: name, label, buildMs, ...capture, staticFiles }),
			);
			console.log(
				`${name} ${label}: ${Object.keys(capture.assets).length} assets, ${staticFiles ? Object.keys(staticFiles).length : 'n/a'} static files, ${capture.errors.length} errors, build ${buildMs} ms`,
			);
		} finally {
			restore();
		}
	}
}
