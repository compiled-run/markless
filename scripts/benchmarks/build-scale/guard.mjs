// Builds the generated app at two sizes and fails when build memory, build CPU, the client module count, the largest chunk or the largest
// build artifact passes its budget, or the built server cannot answer a page.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MARKLESS_SERVER_CHUNK_MAX_BYTES } from '../../../packages/bundler/src/build/chunking.ts';
import { formatChange, readAnchorsWithChanges, recordChange } from '../anchor-ledger.mjs';

// Counts are the same on every run, so they are held exactly: each change records its own delta in its change file, and those add up.
const EXACT_COUNTS = { clientModules: 'client modules', compiles: 'whole-module compiles' };
const ACCEPT = 'node scripts/benchmarks/build-scale/guard.mjs accept --reason "<one line>"';
const USAGE = `usage:
  node scripts/benchmarks/build-scale/guard.mjs
  ${ACCEPT} [--client-modules <n> --compiles <n>]
    accept records this tree's client module and whole-module compile counts at the larger size, minus what main and
    the other branches' change files already hold; without the counts it builds the app once to measure them`;

const config = readAnchorsWithChanges('build-scale');
const budgets = Object.fromEntries(
	Object.entries(config.budgets).map(([name, budget]) => [name, budget.bytes ?? budget.value]),
);
const cpuPerPageBudget = config.budgets.buildCpuPerPageInReferenceRuns;
budgets.buildCpuPerPageInReferenceRuns =
	cpuPerPageBudget.byPlatform?.[`${process.platform}-${process.arch}`] ?? cpuPerPageBudget.value;
const buildScript = new URL('./build.mjs', import.meta.url).pathname;
const referenceScript = new URL('./reference.mjs', import.meta.url).pathname;
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
	const heldAt = (graphEnd) =>
		Math.max(
			...measured.retained
				.filter((entry) => (entry.phase === 'graphEnd') === graphEnd)
				.map((entry) => entry.heapBytes),
		);
	measured.retainedHeapBytes = heldAt(false);
	measured.graphEndHeapBytes = heldAt(true);
	return measured;
}

// Split server chunks load in an order the bundler chose, so the built server answers a real request.
// The fastest of three runs, before and after the builds, so one busy moment does not set this runner's speed.
async function referenceCpuMs() {
	let fastest = Infinity;
	for (let attempt = 0; attempt < 3; attempt++)
		fastest = Math.min(
			fastest,
			JSON.parse(await run(process.execPath, [referenceScript])).cpuMs,
		);
	return fastest;
}

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

function flag(args, name) {
	const i = args.indexOf(name);
	return i < 0 ? undefined : args[i + 1];
}

async function accept(args) {
	const reason = flag(args, '--reason');
	if (!reason?.trim()) throw new Error(USAGE);
	let counts = {
		clientModules: flag(args, '--client-modules'),
		compiles: flag(args, '--compiles'),
	};
	if (counts.clientModules === undefined || counts.compiles === undefined) {
		const dir = await mkdtemp(join(tmpdir(), 'markless-build-scale-'));
		try {
			const measured = await build(join(dir, 'app'), config.pages.at(-1));
			counts = { clientModules: measured.modules.client, compiles: measured.compiles };
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	}
	const { file, changes } = recordChange(
		'build-scale',
		{
			head: (anchors) => {
				for (const name of Object.keys(EXACT_COUNTS)) {
					const value = Number(counts[name]);
					if (!Number.isInteger(value)) throw new Error(`${name}: ${counts[name]} is not a count`);
					anchors.budgets[name].value = value;
				}
				return anchors;
			},
			base: (anchors) => anchors,
			covers: (entry) => entry.path[1] in EXACT_COUNTS,
		},
		{ reason },
	);
	console.log(
		changes.length
			? `recorded in ${file}:\n${changes.map((entry) => `  ${formatChange(entry)}`).join('\n')}`
			: 'the counts match what is recorded; nothing to record',
	);
}

const argv = process.argv.slice(2);
if (argv[0] === 'accept') {
	await accept(argv.slice(1));
	process.exit(0);
}
if (argv.length) {
	console.error(USAGE);
	process.exit(2);
}

const work = await mkdtemp(join(tmpdir(), 'markless-build-scale-'));
try {
	const [small, large] = config.pages;
	const results = [];
	const referenceBefore = await referenceCpuMs();
	for (const pages of [small, large])
		results.push(await build(join(work, `app-${pages}`), pages));
	const referenceMs = Math.min(referenceBefore, await referenceCpuMs());
	const [atSmall, atLarge] = results;
	const perPage = (key) => (atLarge[key] - atSmall[key]) / (large - small);
	const perPageOf = (read) => (read(atLarge) - read(atSmall)) / (large - small);
	const rows = [
		['peak resident memory', atLarge.peakRssBytes, budgets.peakRssBytes],
		['peak resident memory per page', perPage('peakRssBytes'), budgets.peakRssBytesPerPage],
		['heap held after a full collection', atLarge.retainedHeapBytes, budgets.retainedHeapBytes],
		['held heap per page', perPage('retainedHeapBytes'), budgets.retainedHeapBytesPerPage],
		[
			'heap held at the end of the module graph',
			atLarge.graphEndHeapBytes,
			budgets.graphEndHeapBytes,
		],
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
	// Module and compile counts do not vary between runs, so any rise is real: each module costs Rolldown memory and time, each compile a result held until buildEnd.
	const exact = { clientModules: atLarge.modules.client, compiles: atLarge.compiles };
	for (const [key, name] of Object.entries(EXACT_COUNTS)) {
		const value = exact[key];
		const recorded = budgets[key];
		const off = value - recorded;
		const why =
			off > 0
				? `: ${off} more than recorded. If the change is intended, record it: ${ACCEPT}`
				: off < 0
					? `: ${-off} fewer than recorded. Record the win: ${ACCEPT}`
					: '';
		console.log(`${off ? 'FAIL' : 'ok  '} ${name}: ${value} (recorded ${recorded})${why}`);
		if (off) failures.push(name);
	}
	{
		const value = Math.round(perPageOf((build) => build.modules.client) * 10) / 10;
		const over = value > budgets.clientModulesPerPage;
		console.log(
			`${over ? 'FAIL' : 'ok  '} client modules per page: ${value} (budget ${budgets.clientModulesPerPage})`,
		);
		if (over) failures.push('client modules per page');
	}
	// Build time: CPU, which a busy runner moves far less than wall time, per page and as growth with page count.
	// Per page it is read against a fixed workload on the same runner, because CI's runners differ in speed by 1.7x.
	const perPageMs = perPage('buildCpuSeconds') * 1000;
	const timeRows = [
		[
			'build CPU per page, in runs of the reference workload',
			`${(perPageMs / referenceMs).toFixed(3)} (${perPageMs.toFixed(0)} ms; the reference took ${referenceMs.toFixed(0)} ms)`,
			perPageMs / referenceMs,
			budgets.buildCpuPerPageInReferenceRuns,
			`${budgets.buildCpuPerPageInReferenceRuns}`,
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
			`\nbuild-scale guard failed: ${failures.join(', ')}. A budget in scripts/benchmarks/build-scale/budgets.json changes only with a measured, stated reason; the client module and whole-module compile counts move only through a change file written by \`${ACCEPT}\` (docs/ci-process.md section 6).`,
		);
		process.exitCode = 1;
	}
} finally {
	await rm(work, { recursive: true, force: true });
}
