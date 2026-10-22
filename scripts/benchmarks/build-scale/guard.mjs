// Builds the generated app at two sizes and fails when build memory, the largest chunk or the largest
// build artifact passes its budget, or the built server cannot answer a page.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MARKLESS_SERVER_CHUNK_MAX_BYTES } from '../../../packages/bundler/src/build/chunking.ts';

const config = JSON.parse(readFileSync(new URL('./budgets.json', import.meta.url), 'utf8'));
const budgets = Object.fromEntries(
	Object.entries(config.budgets).map(([name, budget]) => [name, budget.bytes ?? budget.value]),
);
const buildScript = new URL('./build.mjs', import.meta.url).pathname;
const MB = 1024 * 1024;

function run(command, args, options = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (chunk) => (stdout += chunk));
		child.stderr.on('data', (chunk) => (stderr += chunk));
		child.on('error', reject);
		child.on('close', (code) =>
			code === 0
				? resolve(stdout)
				: reject(
						new Error(
							`${command} ${args.join(' ')} exited ${code}\n${stderr.slice(-4000)}`,
						),
					),
		);
	});
}

async function build(dir, pages) {
	const stdout = await run(process.execPath, [
		'--expose-gc',
		buildScript,
		'--dir',
		dir,
		'--pages',
		String(pages),
	]);
	const line = stdout.split('\n').find((candidate) => candidate.startsWith('{'));
	if (!line) throw new Error(`the ${pages}-page build printed no measurement`);
	const measured = JSON.parse(line);
	measured.retainedHeapBytes = Math.max(...measured.retained.map((entry) => entry.heapBytes));
	return measured;
}

// Split server chunks load in an order the bundler chose, so the built server answers a real request.
async function serves(dir, path, text) {
	const server = spawn(process.execPath, [join(dir, '.output/server/index.mjs')], {
		env: { ...process.env, PORT: '0', HOST: '127.0.0.1' },
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	let log = '';
	const origin = new Promise((resolve) => {
		server.stdout.on('data', (chunk) => {
			log += chunk;
			const listening = /Listening on:?\s*(http:\/\/[^\s/]+)/.exec(log);
			if (listening) resolve(listening[1]);
		});
		server.stderr.on('data', (chunk) => (log += chunk));
		server.on('exit', () => resolve(null));
	});
	try {
		const base = await origin;
		if (!base) return `the built server exited before it listened:\n${log}`;
		const response = await fetch(`${base}${path}`);
		const body = await response.text();
		return response.status === 200 && body.includes(text)
			? null
			: `GET ${path} answered ${response.status} without ${JSON.stringify(text)}`;
	} finally {
		server.kill();
	}
}

const work = await mkdtemp(join(tmpdir(), 'markless-build-scale-'));
try {
	const [small, large] = config.pages;
	const results = [];
	for (const pages of [small, large])
		results.push(await build(join(work, `app-${pages}`), pages));
	const [atSmall, atLarge] = results;
	const perPage = (key) => (atLarge[key] - atSmall[key]) / (large - small);
	const rows = [
		['peak resident memory', atLarge.peakRssBytes, budgets.peakRssBytes],
		['peak resident memory per page', perPage('peakRssBytes'), budgets.peakRssBytesPerPage],
		['heap held after a full collection', atLarge.retainedHeapBytes, budgets.retainedHeapBytes],
		['held heap per page', perPage('retainedHeapBytes'), budgets.retainedHeapBytesPerPage],
		['largest server chunk', atLarge.largestServerChunk.bytes, MARKLESS_SERVER_CHUNK_MAX_BYTES],
		['largest client chunk', atLarge.largestClientChunk.bytes, budgets.largestClientChunkBytes],
		[
			`largest build artifact (${atLarge.largestArtifact.path.split('/').pop()})`,
			atLarge.largestArtifact.bytes,
			budgets.largestArtifactBytes,
		],
	];
	const failures = [];
	console.log(
		`build scale: ${small} and ${large} pages (${atSmall.seconds}s and ${atLarge.seconds}s wall, ${atSmall.buildCpuSeconds}s and ${atLarge.buildCpuSeconds}s build cpu)`,
	);
	for (const [name, value, budget] of rows) {
		const over = value > budget;
		console.log(
			`${over ? 'FAIL' : 'ok  '} ${name}: ${(value / MB).toFixed(2)} MB (budget ${(budget / MB).toFixed(2)} MB)`,
		);
		if (over) failures.push(name);
	}
	// Build time: CPU, which a busy runner moves far less than wall time, per page and as growth with page count.
	const timeRows = [
		[
			'build CPU per page',
			`${(perPage('buildCpuSeconds') * 1000).toFixed(0)} ms`,
			perPage('buildCpuSeconds') * 1000,
			budgets.buildCpuMsPerPage,
			`${budgets.buildCpuMsPerPage} ms`,
		],
		[
			`build CPU growth for ${large / small}x the pages`,
			`${(atLarge.buildCpuSeconds / atSmall.buildCpuSeconds).toFixed(2)}x`,
			atLarge.buildCpuSeconds / atSmall.buildCpuSeconds,
			budgets.buildCpuGrowth,
			`${budgets.buildCpuGrowth}x`,
		],
	];
	for (const [name, shown, value, budget, budgetShown] of timeRows) {
		const over = value > budget;
		console.log(`${over ? 'FAIL' : 'ok  '} ${name}: ${shown} (budget ${budgetShown})`);
		if (over) failures.push(name);
	}
	const page = await serves(join(work, `app-${large}`), `/p${large - 2}`, `Page ${large - 2}`);
	console.log(
		`${page ? 'FAIL' : 'ok  '} the built server answers a page${page ? `: ${page}` : ''}`,
	);
	if (page) failures.push('server answers a page');
	if (failures.length) {
		console.error(
			`\nbuild-scale guard failed: ${failures.join(', ')}. A budget in scripts/benchmarks/build-scale/budgets.json changes only with a measured, stated reason (docs/ci-process.md section 6).`,
		);
		process.exitCode = 1;
	}
} finally {
	await rm(work, { recursive: true, force: true });
}
