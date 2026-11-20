#!/usr/bin/env node
// CPU-seconds and peak memory of CI's node unit shards, checked against accepted Linux anchors in unit-budget.json.

import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
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
const DEFAULT_HEAVY = join(repoRoot, 'scripts/ci/heavy-tests.json');
// A file holding this much outside the build slot, beside a slotted build (up to 2.6 GB) and the base processes (up to 1.5 GB), moves a shard's peak past the RSS band.
export const SLOT_HOLDER_MB = 1024;
// One file's own peak swung by up to 29% across 49 merge-queue runs (child-async-catch, 1,469 to 1,894 MB), so the check fails only 30% above the line.
export const SLOT_HOLDER_FAIL_MB = Math.round(SLOT_HOLDER_MB * 1.3);
const PLATFORM = `${process.platform}-${process.arch}`;
const ARTIFACT_PATTERN = 'unit-budget-*';

const USAGE = `usage: node scripts/ci/unit-budget.mjs measure -- <command...>
       node scripts/ci/unit-budget.mjs check --measurements <dir> [--budget <file>] [--heavy <file>]
       node scripts/ci/unit-budget.mjs accept --from <run id | dir>... --reason "<why>" [--budget <file>]
       node scripts/ci/unit-budget.mjs margin --from <run id | dir>... --reason "<why>" [--budget <file>]
       node scripts/ci/unit-budget.mjs models --from <run id | dir>... --reason "<why>" [--budget <file>]
       node scripts/ci/unit-budget.mjs suite --from <run id | dir>... --reason "<why>" [--budget <file>]

  measure  runs the command; with MARKLESS_UNIT_BUDGET_OUT set (CI) it writes the process tree's
           CPU-seconds and sampled peak RSS there, for MARKLESS_UNIT_BUDGET_SHARD (Linux only)
  check    fails when the shards' summed CPU-seconds or their largest peak RSS leaves the anchor's
           noise band: above it is over budget, below it is a stale anchor; and when a test file held
           more memory outside the build slot than SLOT_HOLDER_FAIL_MB without being listed to hold it
  accept   takes new anchors from CI artifacts (the median per shard over every attempt of the runs)
  margin   derives the noise band from repeated CI measurements of one test set
  models   derives each CPU model's correction: how far the calibration misjudges its speed on the unit
           suite, and how much of a calibration swing on that model the suite's CPU-s follow
  suite    derives the suite's own yardstick from landed runs: each test file's reference duration, and
           each CPU model's CPU-s per unit of the suite's pace`;

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

/** Every descendant of rootPid with its parent and resident bytes. */
export function descendants(rootPid, pageSize) {
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
	const procs = [];
	const stack = [...(children.get(rootPid) ?? [])];
	while (stack.length) {
		const pid = stack.pop();
		procs.push({ pid, ppid: parentOf.get(pid), rss: rssOf.get(pid) ?? 0 });
		stack.push(...(children.get(pid) ?? []));
	}
	return procs;
}

const MB = 2 ** 20;
const UNATTRIBUTED = '(no test file: vitest main process, pnpm, the wrapper)';

/**
 * Splits one sample of the process tree by test file: each process counts toward the nearest
 * ancestor (itself included) that a test file was recorded for, so a file owns its Chromium and
 * child builds. `label` names a process's kind within its file.
 */
export function attribute(procs, fileOf, label = () => 'process') {
	const byPid = new Map(procs.map((proc) => [proc.pid, proc]));
	const owner = (pid) => {
		for (let at = pid; byPid.has(at); at = byPid.get(at).ppid)
			if (fileOf.has(at)) return fileOf.get(at);
		return UNATTRIBUTED;
	};
	const groups = new Map();
	for (const proc of procs) {
		const file = owner(proc.pid);
		const group = groups.get(file) ?? { file, bytes: 0, parts: new Map() };
		group.bytes += proc.rss;
		const kind = label(proc);
		group.parts.set(kind, (group.parts.get(kind) ?? 0) + proc.rss);
		groups.set(file, group);
	}
	return [...groups.values()]
		.sort((a, b) => b.bytes - a.bytes)
		.map((group) => ({
			file: group.file,
			mb: Math.round(group.bytes / MB),
			parts: Object.fromEntries(
				[...group.parts]
					.sort(([, a], [, b]) => b - a)
					.map(([kind, bytes]) => [kind, Math.round(bytes / MB)]),
			),
		}));
}

// The program's name, or for node the script it runs; Chromium rewrites its argv into one space-joined string.
export function processLabel(args) {
	const name = (path) => path.slice(path.lastIndexOf('/') + 1);
	const words = args.length === 1 ? args[0].split(' ') : args;
	const program = name(words[0] ?? '?');
	if (program !== 'node') return program;
	const valued = new Set(['-r', '--require', '--import', '--loader', '-C', '--conditions']);
	for (let index = 1; index < words.length; index += 1) {
		if (valued.has(words[index])) index += 1;
		else if (!words[index].startsWith('-')) return `node ${name(words[index])}`;
	}
	return 'node';
}

const labelOf = ({ pid }) => {
	try {
		return processLabel(
			readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean),
		);
	} catch {
		return 'exited';
	}
};

// Test files by the pid of the vitest worker that ran them, as unit-budget-attribution.ts records them.
function readFileOwners(dir, known) {
	for (const entry of readdirSync(dir)) {
		const pid = Number(entry);
		if (!Number.isInteger(pid) || known.has(pid)) continue;
		try {
			const file = readFileSync(join(dir, entry), 'utf8').trim();
			if (file) known.set(pid, file);
		} catch {
			continue;
		}
	}
	return known;
}

/** The test files whose vitest worker holds a build slot now, from the pid each slot records (build-slots.ts). */
export function slotHolders(slotsDir, fileOf) {
	const files = new Set();
	let slots = [];
	try {
		slots = readdirSync(slotsDir);
	} catch {
		return files;
	}
	for (const slot of slots) {
		try {
			const file = fileOf.get(Number(readFileSync(join(slotsDir, slot, 'pid'), 'utf8')));
			if (file) files.add(file);
		} catch {
			continue;
		}
	}
	return files;
}

// A fixed JavaScript workload; the shard's CPU-seconds divided by its CPU-seconds is the work done,
// whatever the speed of the runner's CPU model.
export function calibrationRound() {
	const started = process.cpuUsage();
	let seed = 1;
	const rows = [];
	for (let index = 0; index < 400_000; index += 1) {
		seed = (seed * 1103515245 + 12345) & 0x7fffffff;
		rows.push({ id: seed, name: `row-${seed.toString(36)}`, tags: [seed % 7, seed % 11] });
	}
	rows.sort((a, b) => a.name.localeCompare(b.name));
	const text = JSON.stringify(rows);
	const counts = new Map();
	for (const match of text.matchAll(/"row-([a-z0-9]{2})/g))
		counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
	if (JSON.parse(text).length !== rows.length || counts.size === 0)
		throw new Error('calibration workload went wrong');
	const spent = process.cpuUsage(started);
	return (spent.user + spent.system) / 1e6;
}

// How long each test file's tests took, as unit-budget-attribution.ts records them.
function readFileDurations(dir) {
	const fileMs = {};
	let entries = [];
	try {
		entries = readdirSync(dir);
	} catch {
		return fileMs;
	}
	for (const entry of entries)
		for (const line of readFileSync(join(dir, entry), 'utf8').split('\n'))
			if (line) {
				const { file, ms } = JSON.parse(line);
				fileMs[file] = ms;
			}
	return Object.fromEntries(Object.entries(fileMs).sort(([a], [b]) => a.localeCompare(b)));
}

const scriptPath = fileURLToPath(import.meta.url);

// The fastest of three rounds in each of `copies` processes at once, so shared cores slow it as they slow the tests.
async function calibrate(copies) {
	const rounds = await Promise.all(
		Array.from(
			{ length: copies },
			() =>
				new Promise((done, fail) => {
					const child = spawn(process.execPath, [scriptPath, 'calibrate'], {
						stdio: ['ignore', 'pipe', 'inherit'],
					});
					let text = '';
					child.stdout.on('data', (chunk) => (text += chunk));
					child.on('close', (code) =>
						code === 0 ? done(JSON.parse(text)) : fail(new Error('calibration failed')),
					);
				}),
		),
	);
	return Math.round(median(rounds.map((list) => Math.min(...list))) * 1000) / 1000;
}

/** What was alive at a measurement's peak, largest test file first. */
export function describePeak(measurement, limit = 8) {
	const at = measurement.atPeak;
	if (!at) return `  shard ${measurement.shard}: no per-file attribution at its peak`;
	return [
		`  shard ${measurement.shard} at its peak (${measurement.peakRssMb} MB, ${at.atS} s in):`,
		...at.groups.slice(0, limit).map(
			(group) =>
				`    ${group.mb} MB  ${group.file}  (${Object.entries(group.parts)
					.map(([kind, mb]) => `${kind} ${mb}`)
					.join(', ')})`,
		),
	].join('\n');
}

async function measure(command) {
	if (!command.length) throw new Error(USAGE);
	const out = process.env.MARKLESS_UNIT_BUDGET_OUT;
	if (out && process.platform !== 'linux')
		throw new Error(
			'measure records Linux anchors only; unset MARKLESS_UNIT_BUDGET_OUT to run the command plainly',
		);
	let calibration = null;
	let before = null;
	if (out) {
		const cpus = Number(execFileSync('nproc', { encoding: 'utf8' }));
		calibration = { singleS: await calibrate(1), parallelS: await calibrate(cpus), cpus };
		before = procStat('self');
	}
	const filesDir = out ? mkdtempSync(join(tmpdir(), 'unit-budget-files-')) : null;
	const slotsDir = filesDir && join(filesDir, 'build-slots');
	const child = spawn(command[0], command.slice(1), {
		stdio: 'inherit',
		env: filesDir
			? { ...process.env, MARKLESS_UNIT_BUDGET_FILES: filesDir, MARKLESS_BUILD_SLOTS_DIR: slotsDir }
			: process.env,
	});
	for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
	if (!out)
		return new Promise((done) =>
			child.on('close', (code, signal) => done(code ?? (signal ? 1 : 0))),
		);
	const ticks = Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }));
	const pageSize = Number(execFileSync('getconf', ['PAGESIZE'], { encoding: 'utf8' }));
	const started = performance.now();
	let peak = 0;
	let peakAt = null;
	const fileOf = new Map();
	const filePeaks = new Map();
	const unslottedPeaks = new Map();
	const sample = () => {
		const procs = descendants(process.pid, pageSize);
		const total = procs.reduce((sum, proc) => sum + proc.rss, 0);
		readFileOwners(filesDir, fileOf);
		const isNewPeak = total > peak;
		const groups = attribute(procs, fileOf, isNewPeak ? labelOf : undefined);
		for (const group of groups)
			filePeaks.set(group.file, Math.max(filePeaks.get(group.file) ?? 0, group.mb));
		const holding = slotHolders(slotsDir, fileOf);
		for (const group of groups)
			if (!holding.has(group.file) && group.file !== UNATTRIBUTED)
				unslottedPeaks.set(group.file, Math.max(unslottedPeaks.get(group.file) ?? 0, group.mb));
		if (isNewPeak) {
			peak = total;
			peakAt = { atS: round((performance.now() - started) / 1000), groups };
		}
	};
	const timer = setInterval(sample, 1000);
	const exitCode = await new Promise((done) =>
		child.on('close', (code, signal) => done(code ?? (signal ? 1 : 0))),
	);
	clearInterval(timer);
	// cutime/cstime: CPU of every descendant this process waited for, through their own waited children.
	// Minus what the calibration processes spent before the tests started.
	const fields = procStat('self');
	const userS = (Number(fields[13]) - Number(before[13])) / ticks;
	const sysS = (Number(fields[14]) - Number(before[14])) / ticks;
	const own = process.cpuUsage();
	const cpuModel =
		/model name\s*:\s*(.*)/.exec(readFileSync('/proc/cpuinfo', 'utf8'))?.[1] ?? 'unknown';
	const fileMs = readFileDurations(join(filesDir, 'durations'));
	const measurement = {
		version: 2,
		shard: process.env.MARKLESS_UNIT_BUDGET_SHARD ?? 'all',
		platform: PLATFORM,
		cpuModel,
		cpus: calibration.cpus,
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
		calibrationS: calibration.parallelS,
		singleCalibrationS: calibration.singleS,
		wrapperCpuS: round((own.user + own.system) / 1e6, 2),
		atPeak: peakAt,
		filePeaksMb: Object.fromEntries([...filePeaks].sort(([, a], [, b]) => b - a).slice(0, 25)),
		// Each file's peak over the samples where its worker held no build slot.
		fileUnslottedPeaksMb: Object.fromEntries(
			[...unslottedPeaks].sort(([, a], [, b]) => b - a).slice(0, 25),
		),
		fileMs,
	};
	rmSync(filesDir, { recursive: true, force: true });
	mkdirSync(dirname(out), { recursive: true });
	writeFileSync(out, `${JSON.stringify(measurement, null, '\t')}\n`);
	console.log(
		`unit budget: shard ${measurement.shard} used ${measurement.cpuS} CPU-s, peak RSS ${measurement.peakRssMb} MB, in ${measurement.wallS} s (${cpuModel}, calibration ${measurement.calibrationS} CPU-s)`,
	);
	console.log(describePeak(measurement));
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
		if (measurement.version !== 2 || !(measurement.calibrationS > 0))
			problems.push(
				`${measurement.file}: measurement version ${measurement.version} without a calibration; this script reads version 2`,
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

// The calibration ranks CPU models differently from the unit suite, so each recorded model carries a factor.
const modelFactor = (budget, m) => budget.models?.factors?.[m.cpuModel] ?? 1;

/**
 * The calibration a shard is divided by: its own, pulled toward its CPU model's median calibration by
 * the share of a calibration swing the unit suite does not follow on that model (elasticity 1 keeps it).
 */
export function effectiveCalibration(budget, m) {
	const typical = budget.models?.calibrationS?.[m.cpuModel];
	const elasticity = budget.models?.elasticity?.[m.cpuModel];
	if (!(typical > 0) || typeof elasticity !== 'number') return m.calibrationS;
	return typical * (m.calibrationS / typical) ** elasticity;
}

/** A shard's CPU-seconds divided by its effective calibration and its CPU model's factor. */
export const workOf = (budget, m) =>
	m.cpuS / effectiveCalibration(budget, m) / modelFactor(budget, m);

/** What anchors and margins were computed with; changing any of it invalidates them. */
const correctionOf = (budget) => ({
	factors: budget.models?.factors ?? {},
	calibrationS: budget.models?.calibrationS ?? {},
	elasticity: budget.models?.elasticity ?? {},
});

const sameCorrection = (recorded, budget) =>
	JSON.stringify(correctionOf({ models: recorded })) === JSON.stringify(correctionOf(budget));

/** Which suite reference anchors were accepted with; null when the budget has none. */
export const suiteKey = (budget) =>
	budget.suite
		? createHash('sha256').update(JSON.stringify(budget.suite)).digest('hex').slice(0, 12)
		: null;

const MINIMUM_PACE_FILES = 20;

/**
 * How slowly this shard's test files ran against the suite's reference: the median, over its files that
 * have a reference duration, of duration over reference. A few slower files leave it where it is.
 */
export function suitePace(suite, m) {
	if (!suite?.files || !m.fileMs) return null;
	const ratios = [];
	for (const [file, ms] of Object.entries(m.fileMs))
		if (suite.files[file] > 0 && ms > 0) ratios.push(ms / suite.files[file]);
	return ratios.length >= MINIMUM_PACE_FILES ? median(ratios) : null;
}

/**
 * A shard's cost read three ways: through its calibration (`calibration`, CPU-s at the anchors' speed), through
 * its own test files' pace on its CPU model (`suite`), and at its CPU model's typical speed (`typical`). The
 * suite reading sees the host's speed while the tests ran but not a change that slows every file alike; the
 * other two see such a change but misread an unusual host.
 */
export function readingsOf(budget, m) {
	const speed = budget.anchors?.calibrationS ?? 1;
	const pace = suitePace(budget.suite, m);
	const modelPace = budget.suite?.pace?.[m.cpuModel];
	const typical = budget.models?.calibrationS?.[m.cpuModel];
	return {
		calibration: workOf(budget, m) * speed,
		suite: pace && modelPace ? m.cpuS / pace / modelPace : null,
		typical: typical > 0 ? (m.cpuS / typical / modelFactor(budget, m)) * speed : null,
	};
}

/**
 * Each shard's CPU-s at the anchors' speed. With file timings on every shard, a shard counts as its suite
 * reading against its anchor, times one scale for the whole run: the median of what each calibration and each
 * typical-speed reading says against the suite reading of the same shard. One misread calibration or one
 * unusual host moves that median little, while a change that slows every test file moves all six readings.
 * Without file timings each shard counts its calibration reading.
 */
export function countShards(budget, latest) {
	const shards = [...latest].sort(([a], [b]) => a.localeCompare(b));
	const read = shards.map(([shard, m]) => ({
		shard,
		m,
		anchor: budget.anchors?.shards?.[shard],
		...readingsOf(budget, m),
	}));
	const bySuite =
		suiteKey(budget) !== null &&
		budget.anchors?.suite === suiteKey(budget) &&
		read.every((r) => r.suite && r.anchor?.suite > 0 && r.anchor?.cpuS > 0);
	if (!bySuite) return { shards: read.map((r) => ({ ...r, cpuS: r.calibration })), scale: null };
	const scales = read.flatMap((r) => {
		const suite = r.suite / r.anchor.suite;
		const views = [r.calibration / r.anchor.cpuS / suite];
		if (r.typical && r.anchor.typical > 0) views.push(r.typical / r.anchor.typical / suite);
		return views;
	});
	const scale = median(scales);
	return {
		shards: read.map((r) => ({
			...r,
			cpuS: (r.suite / r.anchor.suite) * scale * r.anchor.cpuS,
		})),
		scale,
		readings: scales.length,
	};
}

/** The verdict for one run's shards against the budget file. */
/** Files over the slot line that hold no slot for their run: each must hold it, or keep less outside it. */
export function unslottedHolders(measurements, heavy) {
	const listed = new Set(
		[...(heavy?.inWorkerBuilds?.tests ?? []), ...(heavy?.slotHolders?.tests ?? [])].map(
			(entry) => entry.test,
		),
	);
	const found = [];
	for (const m of measurements)
		for (const [file, mb] of Object.entries(m.fileUnslottedPeaksMb ?? {}))
			if (mb > SLOT_HOLDER_FAIL_MB && !listed.has(file))
				found.push({ file, mb, shard: m.shard, run: m.run });
	return found.sort((a, b) => b.mb - a.mb);
}

export function evaluate(budget, measurements, heavy) {
	const latest = latestPerShard(measurements);
	const failures = validate([...latest.values()], budget);
	for (const { file, mb, shard, run } of unslottedHolders([...latest.values()], heavy))
		failures.push(
			`${file} held ${mb} MB outside the build slot (shard ${shard}, run ${run}), over the ${SLOT_HOLDER_MB} MB line (the check fails above ${SLOT_HOLDER_FAIL_MB} MB). Either list it under "slotHolders" in scripts/ci/heavy-tests.json with that peak, the run and why, so it holds the slot for its whole run and no build overlaps it; or make it keep less outside the slot (build through buildFixture, which takes the slot per build, or free its memory)`,
		);
	const warnings = [];
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
	if (budget.anchors && !sameCorrection(budget.anchors.models, budget))
		failures.push(
			'stale anchor: the CPU-model correction changed after the anchors were accepted; re-anchor with `unit-budget.mjs accept`',
		);
	if (budget.anchors && (budget.anchors.suite ?? null) !== suiteKey(budget))
		failures.push(
			'stale anchor: the suite reference changed after the anchors were accepted; re-anchor with `unit-budget.mjs accept`',
		);
	if (budget.margin && !sameCorrection(budget.margin.models, budget))
		failures.push(
			'stale margin: the CPU-model correction changed after the margin was derived; re-derive it with `unit-budget.mjs margin`',
		);
	const counted = countShards(budget, latest);
	const cpuS = round(counted.shards.reduce((sum, r) => sum + r.cpuS, 0));
	const peakRssMb = Math.max(0, ...[...latest.values()].map((m) => m.peakRssMb));
	for (const { shard, m, anchor, calibration, suite, cpuS: counts } of counted.shards)
		lines.push(
			`  shard ${shard}: ${m.cpuS} CPU-s on ${m.cpuModel} (calibration ${m.calibrationS} CPU-s, ${budget.models?.factors?.[m.cpuModel] ? `counted as ${round(effectiveCalibration(budget, m), 3)}, model factor ${modelFactor(budget, m)}` : 'no factor recorded for this CPU model'}), ${round(calibration)} CPU-s at the anchors' speed by its calibration${suite && anchor?.suite ? `, ${suite >= anchor.suite ? '+' : ''}${round((suite / anchor.suite - 1) * 100)}% against its anchor by its own test files` : ''}, counted ${round(counts)} CPU-s, peak RSS ${m.peakRssMb} MB, ${m.wallS} s wall${anchor ? ` (anchor ${anchor.cpuS} CPU-s, ${anchor.peakRssMb} MB)` : ''}`,
		);
	if (counted.scale !== null)
		lines.push(
			`  every test file at once: ${counted.scale >= 1 ? '+' : ''}${round((counted.scale - 1) * 100)}%, the median of ${counted.readings} calibration and typical-speed readings against the shards' own test files`,
		);
	else if (budget.suite)
		warnings.push(
			'a shard has no file timings or no suite reading for its CPU model, so every shard counts its calibration alone',
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
		// A shard on a model with no factor gets the band measured before factors existed.
		const unknown = budget.models
			? [...latest].filter(([, m]) => !budget.models.factors?.[m.cpuModel])
			: [];
		const unknownMargin = budget.models?.unknownMargin ?? budget.margin.cpu;
		const anchorOf = (shard) => budget.anchors.shards?.[shard]?.cpuS ?? 0;
		const cpuMargin = unknown.length
			? round(
					[...latest.keys()].reduce(
						(sum, shard) =>
							sum +
							anchorOf(shard) *
								(unknown.some(([s]) => s === shard)
									? unknownMargin
									: budget.margin.cpu),
						0,
					) / budget.anchors.cpuS,
					3,
				)
			: budget.margin.cpu;
		for (const [shard, m] of unknown)
			warnings.push(
				`shard ${shard} ran on ${m.cpuModel}, a CPU model with no factor, so its share of the CPU band is the ±${round(unknownMargin * 100)}% measured without factors. Once that model has 5 samples, refit with \`node scripts/ci/unit-budget.mjs models --from <run>... --reason "..."\`, then re-run \`margin\` and \`accept\``,
			);
		band("total CPU at the anchors' speed", cpuS, budget.anchors.cpuS, cpuMargin, 'CPU-s');
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
		warnings,
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

/** New anchors: per shard, the median work over every attempt of every given run, at the median runner speed. */
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
		for (const m of measurements) {
			const shard = m.shard;
			const list = perShard.get(shard) ?? [];
			list.push(m);
			perShard.set(shard, list);
		}
	}
	const speed = round(
		median([...perShard.values()].flat().map((m) => effectiveCalibration(budget, m))),
		3,
	);
	const at = { ...budget, anchors: { calibrationS: speed } };
	// Samples on a CPU model with no suite pace or typical calibration have no such reading.
	const medianOf = (list, key) => {
		const values = list.map((m) => readingsOf(at, m)[key]).filter((value) => value > 0);
		return values.length ? round(median(values)) : undefined;
	};
	const shards = Object.fromEntries(
		[...perShard]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([shard, list]) => [
				shard,
				{
					cpuS: round(median(list.map((m) => workOf(budget, m))) * speed),
					peakRssMb: Math.round(median(list.map((m) => m.peakRssMb))),
					suite: medianOf(list, 'suite'),
					typical: medianOf(list, 'typical'),
				},
			]),
	);
	const anchors = {
		calibrationS: speed,
		cpuS: round(Object.values(shards).reduce((sum, s) => sum + s.cpuS, 0)),
		peakRssMb: Math.max(...Object.values(shards).map((s) => s.peakRssMb)),
		models: correctionOf(budget),
		suite: suiteKey(budget),
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

/** The noise band: the largest deviation of any shard sample from its shard's median, over every attempt given; CPU as work (CPU-s over calibration CPU-s). */
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
				calibrationS: m.calibrationS,
				work: Math.round(workOf(budget, m) * 10) / 10,
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
		cpu: spread('work'),
		rss: spread('peakRssMb'),
		models: correctionOf(budget),
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

// Least squares, not a robust slope: the rare slow host whose tests slow down with its calibration is the signal.
const slope = (points) => {
	const mx = points.reduce((sum, [x]) => sum + x, 0) / points.length;
	const my = points.reduce((sum, [, y]) => sum + y, 0) / points.length;
	let sxy = 0;
	let sxx = 0;
	for (const [x, y] of points) {
		sxy += (x - mx) * (y - my);
		sxx += (x - mx) ** 2;
	}
	return sxx > 0 ? sxy / sxx : 1;
};

/**
 * Each CPU model's correction, fitted against the median work of the same shard in the `neighbours` nearest
 * runs on each side, so the suite's own growth over the fitted runs does not read as runner speed.
 * - calibrationS: the model's median calibration.
 * - elasticity: how far the suite's CPU-s follow a calibration swing on that model (log-log slope, 0 to 1);
 *   a fast calibration round on an otherwise ordinary host must not scale the whole shard. A model with
 *   fewer than `minimumElasticitySamples` keeps its own calibration whole.
 * - factors: how far the calibration misjudges the model's speed on the suite, normalised to a geometric
 *   mean of 1. A model with fewer than `minimumSamples` gets none.
 */
export function deriveModels(
	budget,
	runs,
	reason,
	date = today(),
	minimumSamples = 5,
	minimumElasticitySamples = 20,
	neighbours = 8,
) {
	if (!reason?.trim())
		throw new Error('models needs --reason "<one line: what the samples are>"');
	const samples = [];
	for (const { source, measurements } of runs) {
		const green = measurements.filter((m) => m.exitCode === 0);
		const problems = validate(green, budget);
		if (problems.length) throw new Error(`run ${source}: ${problems.join('; ')}`);
		samples.push(...green);
	}
	const counts = new Map();
	for (const m of samples) counts.set(m.cpuModel, (counts.get(m.cpuModel) ?? 0) + 1);
	const fitted = samples.filter((m) => counts.get(m.cpuModel) >= minimumSamples);
	const names = [...new Set(fitted.map((m) => m.cpuModel))].sort((a, b) => a.localeCompare(b));
	if (names.length < 2)
		throw new Error(
			`factors need at least two CPU models with ${minimumSamples} samples each; got ${JSON.stringify(Object.fromEntries(counts))}`,
		);
	const ofModel = new Map(names.map((name) => [name, fitted.filter((m) => m.cpuModel === name)]));
	const typical = new Map(
		names.map((name) => [name, round(median(ofModel.get(name).map((m) => m.calibrationS)), 3)]),
	);
	const elastic = names.filter((name) => ofModel.get(name).length >= minimumElasticitySamples);
	const elasticity = new Map();
	const factors = new Map();
	const correction = () => ({
		models: {
			factors: Object.fromEntries(factors),
			calibrationS: Object.fromEntries(elastic.map((name) => [name, typical.get(name)])),
			elasticity: Object.fromEntries(elasticity),
		},
	});
	const byShard = new Map();
	for (const m of [...fitted].sort(
		(a, b) => Number(a.run) - Number(b.run) || a.attempt - b.attempt,
	))
		byShard.set(m.shard, [...(byShard.get(m.shard) ?? []), m]);
	for (let pass = 0; pass < 8; pass += 1) {
		const current = correction();
		const reference = new Map();
		for (const list of byShard.values())
			list.forEach((m, index) => {
				const near = list.filter((other, at) => Math.abs(at - index) <= neighbours);
				reference.set(m, median(near.map((n) => workOf(current, n))));
			});
		for (const name of elastic) {
			const points = ofModel
				.get(name)
				.map((m) => [
					Math.log(m.calibrationS / typical.get(name)),
					Math.log(m.cpuS / reference.get(m)),
				]);
			elasticity.set(name, round(Math.min(1, Math.max(0, slope(points))), 2));
		}
		const next = correction();
		for (const name of names)
			factors.set(
				name,
				(factors.get(name) ?? 1) *
					median(ofModel.get(name).map((m) => workOf(next, m) / reference.get(m))),
			);
	}
	const mean = Math.exp(
		[...factors.values()].reduce((sum, f) => sum + Math.log(f), 0) / factors.size,
	);
	const models = {
		unknownMargin: budget.models?.unknownMargin ?? budget.margin?.cpu ?? null,
		factors: Object.fromEntries(
			names.map((name) => [name, round(factors.get(name) / mean, 3)]),
		),
		calibrationS: Object.fromEntries(elastic.map((name) => [name, typical.get(name)])),
		elasticity: Object.fromEntries(elastic.map((name) => [name, elasticity.get(name)])),
		samples: Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b))),
	};
	const sources = [...new Set(samples.map((m) => m.run).filter(Boolean))];
	return {
		...budget,
		models,
		history: [
			...budget.history,
			{
				date,
				change: 'models',
				from: budget.models ? correctionOf(budget) : null,
				to: correctionOf({ models }),
				runs: sources,
				reason: reason.trim(),
			},
		],
	};
}

/**
 * The suite's own yardstick, from landed runs' file timings:
 * - files: each test file's median duration, for files seen `minimumSamples` times at `minimumMs` or more;
 * - pace: each CPU model's CPU-s per unit of suite pace, fitted against the same shard's median in the
 *   `neighbours` nearest runs on each side, so the suite's own growth over the fitted runs cancels, normalised to
 *   a geometric mean of 1. A model with fewer than `minimumSamples` gets none.
 */
export function deriveSuite(
	budget,
	runs,
	reason,
	date = today(),
	minimumMs = 100,
	minimumSamples = 5,
	neighbours = 8,
) {
	if (!reason?.trim()) throw new Error('suite needs --reason "<one line: what the samples are>"');
	const samples = runs
		.flatMap((r) => r.measurements)
		.filter((m) => m.exitCode === 0 && m.fileMs && Object.keys(m.fileMs).length);
	const durations = new Map();
	for (const m of samples)
		for (const [file, ms] of Object.entries(m.fileMs))
			durations.set(file, [...(durations.get(file) ?? []), ms]);
	const files = Object.fromEntries(
		[...durations]
			.filter(([, list]) => list.length >= minimumSamples && median(list) >= minimumMs)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([file, list]) => [file, Math.round(median(list))]),
	);
	const reference = { files };
	const paced = samples
		.map((m) => ({ m, pace: suitePace(reference, m) }))
		.filter(({ pace }) => pace);
	const counts = new Map();
	for (const { m } of paced) counts.set(m.cpuModel, (counts.get(m.cpuModel) ?? 0) + 1);
	const names = [...counts]
		.filter(([, count]) => count >= minimumSamples)
		.map(([name]) => name)
		.sort((a, b) => a.localeCompare(b));
	if (!names.length)
		throw new Error(
			`no CPU model has ${minimumSamples} samples with file timings; got ${JSON.stringify(Object.fromEntries(counts))}`,
		);
	const fitted = paced.filter(({ m }) => names.includes(m.cpuModel));
	const byShard = new Map();
	for (const sample of [...fitted].sort(
		(a, b) => Number(a.m.run) - Number(b.m.run) || a.m.attempt - b.m.attempt,
	))
		byShard.set(sample.m.shard, [...(byShard.get(sample.m.shard) ?? []), sample]);
	const pace = new Map(names.map((name) => [name, 1]));
	const perPace = ({ m, pace: p }) => m.cpuS / p / pace.get(m.cpuModel);
	for (let pass = 0; pass < 8; pass += 1) {
		const near = new Map();
		for (const list of byShard.values())
			list.forEach((sample, index) =>
				near.set(
					sample,
					median(list.filter((_, at) => Math.abs(at - index) <= neighbours).map(perPace)),
				),
			);
		for (const name of names)
			pace.set(
				name,
				pace.get(name) *
					median(
						fitted
							.filter(({ m }) => m.cpuModel === name)
							.map((sample) => perPace(sample) / near.get(sample)),
					),
			);
	}
	const mean = Math.exp(
		[...pace.values()].reduce((sum, value) => sum + Math.log(value), 0) / pace.size,
	);
	const suite = {
		minimumMs,
		pace: Object.fromEntries(names.map((name) => [name, round(pace.get(name) / mean, 3)])),
		samples: Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b))),
		files,
	};
	return {
		...budget,
		suite,
		history: [
			...budget.history,
			{
				date,
				change: 'suite',
				from: budget.suite
					? { files: Object.keys(budget.suite.files).length, pace: budget.suite.pace }
					: null,
				to: { files: Object.keys(files).length, pace: suite.pace },
				runs: [...new Set(samples.map((m) => m.run).filter(Boolean))],
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
	if (command === 'calibrate') {
		console.log(JSON.stringify(Array.from({ length: 3 }, calibrationRound)));
		return 0;
	}
	const budgetPath = resolve(flags(args, '--budget')[0] ?? DEFAULT_BUDGET);
	const budget = readBudget(budgetPath);
	if (command === 'check') {
		const dir = flags(args, '--measurements')[0];
		if (!dir) throw new Error(USAGE);
		const measurements = readMeasurements(dir);
		const heavy = JSON.parse(
			readFileSync(resolve(flags(args, '--heavy')[0] ?? DEFAULT_HEAVY), 'utf8'),
		);
		const result = evaluate(budget, measurements, heavy);
		console.log(result.report);
		for (const warning of result.warnings) console.log(`::warning::${warning}`);
		for (const [, m] of [...latestPerShard(measurements)].sort(([a], [b]) =>
			a.localeCompare(b),
		))
			console.log(describePeak(m));
		if (!result.failures.length) {
			console.log('unit budget: within the noise band of its anchors');
			return 0;
		}
		for (const failure of result.failures) console.error(`::error::${failure}`);
		console.error(`To re-anchor after an intended or measured change: ${result.acceptCommand}`);
		return 1;
	}
	if (
		command === 'accept' ||
		command === 'margin' ||
		command === 'models' ||
		command === 'suite'
	) {
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
				: command === 'models'
					? deriveModels(budget, runs, reason)
					: command === 'suite'
						? deriveSuite(budget, runs, reason)
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
