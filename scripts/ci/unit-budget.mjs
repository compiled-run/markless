#!/usr/bin/env node
// CPU-seconds and peak memory of CI's node unit shards, checked against accepted Linux anchors in unit-budget.json.

import { execFileSync, spawn } from 'node:child_process';
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_BUDGET = join(repoRoot, 'scripts/ci/unit-budget.json');
const PLATFORM = `${process.platform}-${process.arch}`;
const ARTIFACT_PATTERN = 'unit-budget-*';

const USAGE = `usage: node scripts/ci/unit-budget.mjs measure -- <command...>
       node scripts/ci/unit-budget.mjs check --measurements <dir> [--budget <file>]
       node scripts/ci/unit-budget.mjs accept --from <run id | dir>... --reason "<why>" [--budget <file>]
       node scripts/ci/unit-budget.mjs margin --from <run id | dir>... --reason "<why>" [--budget <file>]

  measure  runs the command; with MARKLESS_UNIT_BUDGET_OUT set (CI) it writes the process tree's
           CPU-seconds and sampled peak RSS there, for MARKLESS_UNIT_BUDGET_SHARD (Linux only)
  check    fails when the shards' summed CPU-seconds or their largest peak RSS leaves the anchor's
           noise band: above it is over budget, below it is a stale anchor
  accept   takes new anchors from CI artifacts (the median per shard across the given runs)
  margin   derives the noise band from repeated CI measurements of one test set`;

const flags = (args, name) => {
	const values = [];
	for (let index = 0; index < args.length; index += 1)
		if (args[index] === name && index + 1 < args.length) values.push(args[index + 1]);
	return values;
};

const median = (values) => {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const round = (value, places = 1) => Math.round(value * 10 ** places) / 10 ** places;

// /proc/<pid>/stat fields after the parenthesised command name, 0 = field 3 (state).
const procStat = (pid) => {
	const text = readFileSync(`/proc/${pid}/stat`, 'utf8');
	return text.slice(text.lastIndexOf(')') + 2).split(' ');
};

function treeRssBytes(rootPid, pageSize) {
	const parentOf = new Map();
	const rssOf = new Map();
	for (const entry of readdirSync('/proc')) {
		if (!/^\d+$/.test(entry)) continue;
		try {
			const fields = procStat(entry);
			parentOf.set(Number(entry), Number(fields[1]));
			rssOf.set(Number(entry), Number(fields[21]) * pageSize);
		} catch {
			continue;
		}
	}
	const children = new Map();
	for (const [pid, parent] of parentOf) {
		const list = children.get(parent);
		if (list) list.push(pid);
		else children.set(parent, [pid]);
	}
	let total = 0;
	const stack = [...(children.get(rootPid) ?? [])];
	while (stack.length) {
		const pid = stack.pop();
		total += rssOf.get(pid) ?? 0;
		stack.push(...(children.get(pid) ?? []));
	}
	return total;
}

async function measure(command) {
	if (!command.length) throw new Error(USAGE);
	const out = process.env.MARKLESS_UNIT_BUDGET_OUT;
	const child = spawn(command[0], command.slice(1), { stdio: 'inherit' });
	for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
	if (!out)
		return new Promise((done) =>
			child.on('close', (code, signal) => done(code ?? (signal ? 1 : 0))),
		);
	if (process.platform !== 'linux')
		throw new Error(
			'measure records Linux anchors only; unset MARKLESS_UNIT_BUDGET_OUT to run the command plainly',
		);
	const ticks = Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }));
	const pageSize = Number(execFileSync('getconf', ['PAGESIZE'], { encoding: 'utf8' }));
	const started = performance.now();
	let peak = 0;
	const sample = () => {
		peak = Math.max(peak, treeRssBytes(process.pid, pageSize));
	};
	const timer = setInterval(sample, 1000);
	const exitCode = await new Promise((done) =>
		child.on('close', (code, signal) => done(code ?? (signal ? 1 : 0))),
	);
	clearInterval(timer);
	// cutime/cstime: CPU of every descendant this process waited for, through their own waited children.
	const fields = procStat('self');
	const userS = Number(fields[13]) / ticks;
	const sysS = Number(fields[14]) / ticks;
	const own = process.cpuUsage();
	const cpuModel =
		/model name\s*:\s*(.*)/.exec(readFileSync('/proc/cpuinfo', 'utf8'))?.[1] ?? 'unknown';
	const measurement = {
		version: 1,
		shard: process.env.MARKLESS_UNIT_BUDGET_SHARD ?? 'all',
		platform: PLATFORM,
		cpuModel,
		cpus: Number(execFileSync('nproc', { encoding: 'utf8' })),
		sha: process.env.GITHUB_SHA ?? null,
		run: process.env.GITHUB_RUN_ID ?? null,
		attempt: Number(process.env.GITHUB_RUN_ATTEMPT ?? 1),
		command,
		exitCode,
		wallS: round((performance.now() - started) / 1000),
		cpuS: round(userS + sysS),
		userS: round(userS),
		sysS: round(sysS),
		peakRssMb: Math.round(peak / 2 ** 20),
		samplerCpuS: round((own.user + own.system) / 1e6, 2),
	};
	mkdirSync(dirname(out), { recursive: true });
	writeFileSync(out, `${JSON.stringify(measurement, null, '\t')}\n`);
	console.log(
		`unit budget: shard ${measurement.shard} used ${measurement.cpuS} CPU-s, peak RSS ${measurement.peakRssMb} MB, in ${measurement.wallS} s (${cpuModel})`,
	);
	return exitCode;
}

const jsonFilesUnder = (dir) =>
	readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return jsonFilesUnder(path);
		return name.endsWith('.json') ? [path] : [];
	});

/** Every measurement in a folder, as uploaded by every attempt of every shard. */
export function readMeasurements(dir) {
	return jsonFilesUnder(dir).map((path) => ({
		...JSON.parse(readFileSync(path, 'utf8')),
		file: path,
	}));
}

/** One measurement per shard: the latest attempt's. */
export function latestPerShard(measurements) {
	const byShard = new Map();
	for (const measurement of measurements) {
		const held = byShard.get(measurement.shard);
		if (!held || measurement.attempt > held.attempt)
			byShard.set(measurement.shard, measurement);
	}
	return byShard;
}

function validate(measurements, budget) {
	const problems = [];
	for (const measurement of measurements) {
		if (measurement.version !== 1)
			problems.push(
				`${measurement.file}: unknown measurement version ${measurement.version}`,
			);
		if (measurement.platform !== budget.platform)
			problems.push(
				`shard ${measurement.shard} was measured on ${measurement.platform}; the anchors are ${budget.platform} from CI`,
			);
		if (measurement.exitCode !== 0)
			problems.push(
				`shard ${measurement.shard} (attempt ${measurement.attempt}) exited ${measurement.exitCode}; only a green run measures the suite`,
			);
	}
	return problems;
}

const shardList = (shards) => [...shards].sort().join(', ');

/** The verdict for one run's shards against the budget file. */
export function evaluate(budget, measurements) {
	const latest = latestPerShard(measurements);
	const failures = validate([...latest.values()], budget);
	const lines = [];
	const measured = [...latest.keys()];
	if (!latest.size) failures.push('no unit budget measurements: every unit shard uploads one');
	if (!budget.margin) failures.push('no noise margin: derive one with `unit-budget.mjs margin`');
	if (!budget.anchors)
		failures.push('no anchors: accept them from a green CI run with `unit-budget.mjs accept`');
	else if (shardList(measured) !== shardList(Object.keys(budget.anchors.shards)))
		failures.push(
			`stale anchor: the anchors cover shards [${shardList(Object.keys(budget.anchors.shards))}] but this run measured [${shardList(measured)}]; re-anchor from this run`,
		);
	const cpuS = round([...latest.values()].reduce((sum, m) => sum + m.cpuS, 0));
	const peakRssMb = Math.max(0, ...[...latest.values()].map((m) => m.peakRssMb));
	for (const [shard, m] of [...latest].sort(([a], [b]) => a.localeCompare(b)))
		lines.push(
			`  shard ${shard}: ${m.cpuS} CPU-s, peak RSS ${m.peakRssMb} MB, ${m.wallS} s wall, ${m.cpuModel}${budget.anchors?.shards?.[shard] ? ` (anchor ${budget.anchors.shards[shard].cpuS} CPU-s, ${budget.anchors.shards[shard].peakRssMb} MB)` : ''}`,
		);
	if (budget.margin && budget.anchors) {
		const band = (name, value, anchor, margin, unit) => {
			const high = anchor * (1 + margin);
			const low = anchor * (1 - margin);
			const change = `${value} ${unit} against an anchor of ${anchor} ${unit} (${value >= anchor ? '+' : ''}${round(((value - anchor) / anchor) * 100)}%, noise margin ±${round(margin * 100)}%)`;
			lines.push(`  ${name}: ${change}`);
			if (value > high)
				failures.push(
					`over budget: ${name} ${change}. Find what made the unit suite heavier; if the cost is intended, re-anchor with a measured reason`,
				);
			else if (value < low)
				failures.push(
					`stale anchor: ${name} ${change}. The suite got lighter, so the anchor no longer protects anything; re-anchor from this run`,
				);
		};
		band('total CPU', cpuS, budget.anchors.cpuS, budget.margin.cpu, 'CPU-s');
		band(
			'largest shard peak RSS',
			peakRssMb,
			budget.anchors.peakRssMb,
			budget.margin.rss,
			'MB',
		);
	}
	const run = [...latest.values()][0]?.run;
	return {
		failures,
		cpuS,
		peakRssMb,
		report: [
			`unit budget (${measured.length} shards${run ? `, run ${run}` : ''}):`,
			...lines,
		].join('\n'),
		acceptCommand: `node scripts/ci/unit-budget.mjs accept --from ${run ?? '<run id>'} --reason "<measured reason>"`,
	};
}

function download(source) {
	if (!/^\d+$/.test(source)) return { dir: resolve(source), cleanup: () => {} };
	const dir = mkdtempSync(join(tmpdir(), 'unit-budget-'));
	execFileSync('gh', ['run', 'download', source, '--pattern', ARTIFACT_PATTERN, '--dir', dir], {
		stdio: 'inherit',
	});
	return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function collect(sources) {
	const runs = [];
	for (const source of sources) {
		const { dir, cleanup } = download(source);
		try {
			runs.push({ source, measurements: readMeasurements(dir) });
		} finally {
			cleanup();
		}
	}
	return runs;
}

const readBudget = (path) => JSON.parse(readFileSync(path, 'utf8'));
const writeBudget = (path, budget) =>
	writeFileSync(path, `${JSON.stringify(budget, null, '\t')}\n`);
const today = () => new Date().toISOString().slice(0, 10);

/** New anchors: per shard, the median of each run's latest attempt. */
export function acceptAnchors(budget, runs, reason, date = today()) {
	if (!reason?.trim())
		throw new Error('accept needs --reason "<one line: the measured reason the cost moved>"');
	const perShard = new Map();
	let expected = null;
	for (const { source, measurements } of runs) {
		const problems = validate(measurements, budget);
		if (problems.length) throw new Error(`run ${source}: ${problems.join('; ')}`);
		const latest = latestPerShard(measurements);
		if (!latest.size) throw new Error(`run ${source} has no unit budget measurements`);
		expected ??= shardList(latest.keys());
		if (shardList(latest.keys()) !== expected)
			throw new Error(
				`run ${source} measured shards [${shardList(latest.keys())}], another run [${expected}]`,
			);
		for (const [shard, m] of latest) {
			const list = perShard.get(shard) ?? [];
			list.push(m);
			perShard.set(shard, list);
		}
	}
	const shards = Object.fromEntries(
		[...perShard]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([shard, list]) => [
				shard,
				{
					cpuS: round(median(list.map((m) => m.cpuS))),
					peakRssMb: Math.round(median(list.map((m) => m.peakRssMb))),
				},
			]),
	);
	const anchors = {
		cpuS: round(Object.values(shards).reduce((sum, s) => sum + s.cpuS, 0)),
		peakRssMb: Math.max(...Object.values(shards).map((s) => s.peakRssMb)),
		shards,
		runs: runs.map((r) => r.source),
		sha: runs.at(-1).measurements[0]?.sha ?? null,
	};
	return {
		...budget,
		anchors,
		history: [
			...budget.history,
			{
				date,
				change: 'anchors',
				from: budget.anchors
					? { cpuS: budget.anchors.cpuS, peakRssMb: budget.anchors.peakRssMb }
					: null,
				to: { cpuS: anchors.cpuS, peakRssMb: anchors.peakRssMb },
				runs: anchors.runs,
				reason: reason.trim(),
			},
		],
	};
}

/** The noise band: the largest deviation of any shard sample from its shard's median, over every attempt given. */
export function deriveMargin(budget, runs, reason, date = today(), minimumSamples = 3) {
	if (!reason?.trim())
		throw new Error('margin needs --reason "<one line: what the samples are>"');
	const perShard = new Map();
	for (const { source, measurements } of runs) {
		const problems = validate(measurements, budget);
		if (problems.length) throw new Error(`run ${source}: ${problems.join('; ')}`);
		for (const m of measurements) {
			const list = perShard.get(m.shard) ?? [];
			list.push({
				run: m.run ?? source,
				attempt: m.attempt,
				sha: m.sha,
				cpuS: m.cpuS,
				peakRssMb: m.peakRssMb,
				cpuModel: m.cpuModel,
			});
			perShard.set(m.shard, list);
		}
	}
	if (!perShard.size) throw new Error('no unit budget measurements in the given runs');
	for (const [shard, list] of perShard)
		if (list.length < minimumSamples)
			throw new Error(
				`shard ${shard} has ${list.length} samples; a margin needs at least ${minimumSamples} per shard`,
			);
	const spread = (key) => {
		let largest = 0;
		for (const list of perShard.values()) {
			const middle = median(list.map((s) => s[key]));
			for (const s of list) largest = Math.max(largest, Math.abs(s[key] / middle - 1));
		}
		return Math.ceil(largest * 1000) / 1000;
	};
	const margin = {
		cpu: spread('cpuS'),
		rss: spread('peakRssMb'),
		samples: Object.fromEntries([...perShard].sort(([a], [b]) => a.localeCompare(b))),
	};
	return {
		...budget,
		margin,
		history: [
			...budget.history,
			{
				date,
				change: 'margin',
				from: budget.margin ? { cpu: budget.margin.cpu, rss: budget.margin.rss } : null,
				to: { cpu: margin.cpu, rss: margin.rss },
				runs: runs.map((r) => r.source),
				reason: reason.trim(),
			},
		],
	};
}

async function main(argv) {
	const separator = argv.indexOf('--');
	const args = separator === -1 ? argv : argv.slice(0, separator);
	const command = args[0];
	if (command === 'measure') return measure(separator === -1 ? [] : argv.slice(separator + 1));
	const budgetPath = resolve(flags(args, '--budget')[0] ?? DEFAULT_BUDGET);
	const budget = readBudget(budgetPath);
	if (command === 'check') {
		const dir = flags(args, '--measurements')[0];
		if (!dir) throw new Error(USAGE);
		const result = evaluate(budget, readMeasurements(dir));
		console.log(result.report);
		if (!result.failures.length) {
			console.log('unit budget: within the noise band of its anchors');
			return 0;
		}
		for (const failure of result.failures) console.error(`::error::${failure}`);
		console.error(`To re-anchor after an intended or measured change: ${result.acceptCommand}`);
		return 1;
	}
	if (command === 'accept' || command === 'margin') {
		const sources = flags(args, '--from');
		if (!sources.length) throw new Error(USAGE);
		const reason = flags(args, '--reason')[0];
		const runs = collect(sources);
		if (command === 'margin') {
			// Vitest shards by file path, so an added or removed test file moves work between shards.
			const shas = [
				...new Set(runs.flatMap((r) => r.measurements.map((m) => m.sha)).filter(Boolean)),
			];
			for (const sha of shas.slice(1)) {
				const moved = execFileSync(
					'git',
					[
						'-C',
						repoRoot,
						'diff',
						'--name-only',
						'--diff-filter=ADR',
						shas[0],
						sha,
						'--',
						':(glob)**/*.test.*',
					],
					{ encoding: 'utf8' },
				).trim();
				if (moved)
					throw new Error(
						`the samples' commits ${shas[0]} and ${sha} test different files, so their shards differ:\n${moved}`,
					);
			}
		}
		const next =
			command === 'accept'
				? acceptAnchors(budget, runs, reason)
				: deriveMargin(budget, runs, reason);
		writeBudget(budgetPath, next);
		const entry = next.history.at(-1);
		console.log(
			`${budgetPath}: ${entry.change} ${JSON.stringify(entry.from)} -> ${JSON.stringify(entry.to)}`,
		);
		return 0;
	}
	console.error(USAGE);
	return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
	main(process.argv.slice(2)).then(
		(code) => process.exit(code),
		(error) => {
			console.error(error.message);
			process.exit(2);
		},
	);
