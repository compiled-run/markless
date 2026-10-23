// Times one app's production build at two checkouts, interleaved on one machine, and prints medians.
// Usage: node scripts/ci/build-timing.mjs <base checkout> <head checkout> <app dir> <rounds>
import { spawn } from 'node:child_process';
import { appendFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const [baseDir, headDir, app, roundsArg] = process.argv.slice(2);
if (!baseDir || !headDir || !app) {
	console.error(
		'usage: node scripts/ci/build-timing.mjs <base checkout> <head checkout> <app dir> [rounds]',
	);
	process.exit(2);
}
const rounds = Number(roundsArg ?? 3);
const sides = [
	{ name: 'base', dir: resolve(baseDir) },
	{ name: 'head', dir: resolve(headDir) },
];
const results = [];

function build(side, mode, round) {
	const appDir = resolve(side.dir, app);
	// Cold drops Vite's cache directory, where the compile cache lives too; warm keeps it.
	if (mode === 'cold')
		rmSync(resolve(appDir, 'node_modules/.vite'), { recursive: true, force: true });
	for (const output of ['.output', 'dist', '.vercel'])
		rmSync(resolve(appDir, output), { recursive: true, force: true });
	return new Promise((done) => {
		const started = performance.now();
		const child = spawn(
			process.env.BUILD_TIMING_TIME ?? '/usr/bin/time',
			['-f', '%U %S %M', 'pnpm', 'run', 'build'],
			{
				cwd: appDir,
				stdio: ['ignore', 'ignore', 'pipe'],
			},
		);
		let stderr = '';
		child.stderr.on('data', (chunk) => (stderr += chunk));
		child.on('close', (code) => {
			const wall = (performance.now() - started) / 1000;
			const [user, sys, maxKb] = stderr.trim().split('\n').at(-1).split(' ').map(Number);
			const row = {
				side: side.name,
				mode,
				round,
				code,
				wall,
				cpu: user + sys,
				maxRssGb: maxKb / 1e6,
			};
			console.log(JSON.stringify(row));
			if (code !== 0) console.log(stderr.slice(-3000));
			results.push(row);
			done();
		});
	});
}

// Alternating which side goes first each round cancels a runner that speeds up or slows down over time.
for (let round = 1; round <= rounds; round++) {
	const order = round % 2 === 1 ? sides : [...sides].reverse();
	for (const mode of ['cold', 'warm']) for (const side of order) await build(side, mode, round);
}

const median = (values) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
const summary = [
	'| Build | Base wall | Head wall | Change | Base CPU | Head CPU | Base max RSS | Head max RSS |',
	'| --- | --- | --- | --- | --- | --- | --- | --- |',
];
let failed = false;
for (const mode of ['cold', 'warm']) {
	const of = (name) => results.filter((row) => row.side === name && row.mode === mode);
	const base = of('base');
	const head = of('head');
	if ([...base, ...head].some((row) => row.code !== 0)) failed = true;
	const ok = (rows) => rows.filter((row) => row.code === 0);
	if (!ok(base).length || !ok(head).length) continue;
	const [bw, hw] = [median(ok(base).map((r) => r.wall)), median(ok(head).map((r) => r.wall))];
	summary.push(
		`| ${mode} (${ok(base).length}/${ok(head).length} runs) | ${bw.toFixed(1)} s | ${hw.toFixed(1)} s | ${(((hw - bw) / bw) * 100).toFixed(1)}% | ${median(ok(base).map((r) => r.cpu)).toFixed(1)} s | ${median(ok(head).map((r) => r.cpu)).toFixed(1)} s | ${median(ok(base).map((r) => r.maxRssGb)).toFixed(2)} GB | ${median(ok(head).map((r) => r.maxRssGb)).toFixed(2)} GB |`,
	);
}
console.log(`\n${summary.join('\n')}`);
if (process.env.GITHUB_STEP_SUMMARY)
	appendFileSync(
		process.env.GITHUB_STEP_SUMMARY,
		`### Build timing: \`${app}\`, ${rounds} rounds, medians\n\n${summary.join('\n')}\n`,
	);
if (failed) {
	console.error('a build failed; its rows are excluded from the medians above');
	process.exit(1);
}
