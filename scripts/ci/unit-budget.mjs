#!/usr/bin/env node
// CPU-seconds and peak memory of CI's node unit shards, checked against accepted Linux anchors in unit-budget.json.

import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	appendFileSync,
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
// The line for memory a file keeps outside the build slot: over it, the file holds the slot for its run (docs/ci-process.md says what it guarantees).
export const SLOT_HOLDER_MB = 1024;
// One unlisted file's peak outside the slot moved by up to 1.72x across this check's first three CI runs (34 files, median 1.16x).
export const SLOT_HOLDER_FAIL_MB = Math.round(SLOT_HOLDER_MB * 1.72);
// A listed file under this in a run cannot be over the line by noise.
export const SLOT_HOLDER_STALE_MB = Math.round(SLOT_HOLDER_MB / 1.72);
// Whole-file slot holds may cover at most this share of a shard's wall time, so the list cannot make a shard serial.
export const SLOT_HELD_SHARE = 0.5;
const RECORDED_FILE_MB = 256;
const PLATFORM = `${process.platform}-${process.arch}`;
const ARTIFACT_PATTERN = 'unit-budget-*';
// A run is compared with the median of main's last this-many landed merge-queue runs that measured the unit suite.
export const MAIN_RUNS = 10;

const USAGE = `usage: node scripts/ci/unit-budget.mjs measure -- <command...>
       node scripts/ci/unit-budget.mjs check --measurements <dir> [--main <dir>] [--budget <file>] [--heavy <file>] [--changed <file>]
       node scripts/ci/unit-budget.mjs main --out <dir> [--ref <git ref>]
       node scripts/ci/unit-budget.mjs drift --main <dir> [--budget <file>]
       node scripts/ci/unit-budget.mjs accept --from <run id | dir>... --reason "<why>" [--budget <file>]
       node scripts/ci/unit-budget.mjs margin --from <run id | dir>... --reason "<why>" [--budget <file>]
       node scripts/ci/unit-budget.mjs models --from <run id | dir>... --reason "<why>" [--budget <file>]
       node scripts/ci/unit-budget.mjs suite --from <run id | dir>... --reason "<why>" [--budget <file>]

  measure  runs the command; with MARKLESS_UNIT_BUDGET_OUT set (CI) it writes the process tree's
           CPU-seconds and sampled peak RSS there, for MARKLESS_UNIT_BUDGET_SHARD (Linux only)
  check    fails when the shards' summed CPU-seconds or their largest peak RSS is over budget: above main's
           median (--main, one folder a landed run) by more than the noise margin, or above the ceiling,
           the committed anchor plus the margin, which no run may pass. Under main's band only warns. It
           reports test files over the build-slot line and fails for one only when --changed lists it
  main     downloads the unit budget measurements of main's last ${MAIN_RUNS} landed merge-queue runs (gh, GH_TOKEN)
  drift    warns when main's median has moved more than half the margin from the committed anchors
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

/** Which test files' workers hold a build slot now, and whether one is held for a whole file, from what each slot records (build-slots.ts). */
export function readSlots(slotsDir, fileOf) {
	const holding = new Set();
	let wholeFile = false;
	let slots = [];
	try {
		slots = readdirSync(slotsDir);
	} catch {
		return { holding, wholeFile };
	}
	for (const slot of slots) {
		const read = (name) => {
			try {
				return readFileSync(join(slotsDir, slot, name), 'utf8');
			} catch {
				return '';
			}
		};
		const file = fileOf.get(Number(read('pid')));
		if (file) holding.add(file);
		if (read('held') === 'file') wholeFile = true;
	}
	return { holding, wholeFile };
}

/**
 * Folds one sample into the running per-file peaks. `before` and `after` are the slots read on either side of the
 * process snapshot: a file counts as holding a slot if it held one at either read, so a build that ends between them
 * is not counted as memory outside the slot.
 */
export function recordSample(state, groups, before, after) {
	for (const group of groups)
		state.filePeaks.set(group.file, Math.max(state.filePeaks.get(group.file) ?? 0, group.mb));
	for (const group of groups) {
		if (group.file === UNATTRIBUTED) continue;
		if (before.holding.has(group.file) || after.holding.has(group.file)) continue;
		state.unslottedPeaks.set(
			group.file,
			Math.max(state.unslottedPeaks.get(group.file) ?? 0, group.mb),
		);
	}
	if (before.wholeFile || after.wholeFile) state.wholeFileHeldSamples += 1;
}

const atLeast = (peaks, mb) =>
	Object.fromEntries([...peaks].filter(([, v]) => v >= mb).sort(([, a], [, b]) => b - a));

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
	const state = { filePeaks: new Map(), unslottedPeaks: new Map(), wholeFileHeldSamples: 0 };
	const sample = () => {
		readFileOwners(filesDir, fileOf);
		const before = readSlots(slotsDir, fileOf);
		const procs = descendants(process.pid, pageSize);
		const total = procs.reduce((sum, proc) => sum + proc.rss, 0);
		readFileOwners(filesDir, fileOf);
		const after = readSlots(slotsDir, fileOf);
		const isNewPeak = total > peak;
		const groups = attribute(procs, fileOf, isNewPeak ? labelOf : undefined);
		recordSample(state, groups, before, after);
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
		filePeaksMb: atLeast(state.filePeaks, RECORDED_FILE_MB),
		fileUnslottedPeaksMb: atLeast(state.unslottedPeaks, RECORDED_FILE_MB),
		wholeFileSlotS: state.wholeFileHeldSamples,
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

/**
 * What the slot line finds in one run: unlisted files over it, listed files far under it, and each shard's share of
 * wall time under a whole-file slot hold. `changed` is the files this change adds or modifies, or null when unknown.
 */
export function slotFindings(measurements, heavy, changed) {
	const holders = new Set((heavy?.slotHolders?.tests ?? []).map((entry) => entry.test));
	const listed = new Set([...(heavy?.inWorkerBuilds?.tests ?? []).map((entry) => entry.test), ...holders]);
	const touched = (file) => changed?.has(file) ?? false;
	const over = [];
	const stale = [];
	const held = [];
	for (const m of measurements) {
		for (const [file, mb] of Object.entries(m.fileUnslottedPeaksMb ?? {}))
			if (mb > SLOT_HOLDER_MB && !listed.has(file))
				over.push({ file, mb, shard: m.shard, run: m.run, fails: mb > SLOT_HOLDER_FAIL_MB && touched(file) });
		for (const file of holders)
			if (m.fileMs?.[file] !== undefined && (m.filePeaksMb?.[file] ?? 0) < SLOT_HOLDER_STALE_MB)
				stale.push({ file, mb: m.filePeaksMb?.[file] ?? 0, shard: m.shard, run: m.run, fails: touched(file) });
		if (m.wholeFileSlotS !== undefined && m.wallS > 0)
			held.push({
				shard: m.shard,
				heldS: m.wholeFileSlotS,
				wallS: m.wallS,
				share: m.wholeFileSlotS / m.wallS,
				fails: m.wholeFileSlotS / m.wallS > SLOT_HELD_SHARE && touched('scripts/ci/heavy-tests.json'),
			});
	}
	return { over: over.sort((a, b) => b.mb - a.mb), stale, held: held.sort((a, b) => a.shard.localeCompare(b.shard)) };
}

/**
 * Main's level: over the newest landed runs (newest first) whose shards match the anchors, the median of each run's
 * total CPU counted as `check` counts it and of its largest shard peak. Null levels when fewer than MAIN_RUNS qualify.
 */
export function mainBaseline(budget, mainRuns) {
	const levels = [];
	for (const { source, measurements } of mainRuns) {
		if (levels.length === MAIN_RUNS) break;
		const latest = latestPerShard(measurements);
		if (!latest.size || validate([...latest.values()], budget).length) continue;
		if (shardList(latest.keys()) !== shardList(Object.keys(budget.anchors?.shards ?? {})))
			continue;
		const counted = countShards(budget, latest);
		levels.push({
			source,
			cpuS: counted.shards.reduce((sum, r) => sum + r.cpuS, 0),
			peakRssMb: Math.max(...[...latest.values()].map((m) => m.peakRssMb)),
		});
	}
	const runs = levels.map((level) => level.source);
	if (levels.length < MAIN_RUNS) return { runs, cpuS: null, peakRssMb: null };
	return {
		runs,
		cpuS: round(median(levels.map((level) => level.cpuS))),
		peakRssMb: Math.round(median(levels.map((level) => level.peakRssMb))),
	};
}

/** Warnings for a main level more than half the margin away from its committed anchor. */
export function driftWarnings(budget, main) {
	const warnings = [];
	if (!budget.anchors || !budget.margin) return warnings;
	for (const [name, level, anchor, margin, unit] of [
		[
			"total CPU at the anchors' speed",
			main.cpuS,
			budget.anchors.cpuS,
			budget.margin.cpu,
			'CPU-s',
		],
		[
			'largest shard peak RSS',
			main.peakRssMb,
			budget.anchors.peakRssMb,
			budget.margin.rss,
			'MB',
		],
	]) {
		if (level === null || Math.abs(level / anchor - 1) <= margin / 2) continue;
		warnings.push(
			`main moved: ${name} on main's last ${main.runs.length} landed runs is ${level} ${unit}, ${level >= anchor ? '+' : ''}${round((level / anchor - 1) * 100)}% from the committed anchor of ${anchor} ${unit}, more than half the ±${round(margin * 100)}% margin. A re-anchor pull request with an attribution table (which merged changes moved it, by test file) is expected: \`node scripts/ci/unit-budget.mjs accept --from ${main.runs.join(' ')} --reason "..."\``,
		);
	}
	return warnings;
}

/**
 * The verdict for one run's shards against the budget file and, when given, main's last landed runs (`mainRuns`,
 * newest first). A run may not exceed main's median by more than the margin, nor the committed anchor's ceiling.
 */
export function evaluate(budget, measurements, heavy, changed = null, mainRuns = null) {
	const latest = latestPerShard(measurements);
	const failures = validate([...latest.values()], budget);
	const warnings = [];
	const lines = [];
	const slots = slotFindings([...latest.values()], heavy, changed);
	for (const { file, mb, shard, run, fails } of slots.over)
		(fails ? failures : warnings).push(
			`${file} held ${mb} MB outside the build slot (shard ${shard}, run ${run}), over the ${SLOT_HOLDER_MB} MB line${fails ? ` and this change touches it (the check fails a changed file above ${SLOT_HOLDER_FAIL_MB} MB)` : ''}. Either list it under "slotHolders" in scripts/ci/heavy-tests.json with that peak, the run and why, so it holds the slot for its whole run and no build overlaps it; or make it keep less outside the slot (build through buildFixture, which takes the slot per build, or free its memory)`,
		);
	for (const { file, mb, shard, run, fails } of slots.stale)
		(fails ? failures : warnings).push(
			`stale: ${file} is listed under "slotHolders" but peaked at ${mb ? `${mb} MB` : `under ${RECORDED_FILE_MB} MB`} in this run (shard ${shard}, run ${run}), under ${SLOT_HOLDER_STALE_MB} MB, so it no longer needs the slot; remove its entry`,
		);
	for (const { shard, heldS, wallS, share, fails } of slots.held) {
		const line = `shard ${shard} ran ${heldS} s of its ${wallS} s under a whole-file slot hold (${round(share * 100)}%, ceiling ${SLOT_HELD_SHARE * 100}%)`;
		lines.push(`  ${line}`);
		if (share > SLOT_HELD_SHARE)
			(fails ? failures : warnings).push(
				`${line}: the slot holders make this shard mostly serial; make a listed file lighter rather than list another`,
			);
	}
	const overLine = slots.over.length;
	lines.push(
		`  files over the ${SLOT_HOLDER_MB} MB slot line without holding the slot: ${overLine}${changed ? '' : ' (no changed-file set, so none can fail)'}`,
	);
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
	const main = mainRuns && budget.anchors ? mainBaseline(budget, mainRuns) : null;
	if (main && main.cpuS === null)
		warnings.push(
			`main's last landed runs gave ${main.runs.length} of ${MAIN_RUNS} usable unit budget measurements, so this run is held to the committed anchors alone`,
		);
	if (main && main.cpuS !== null) {
		lines.push(
			`  main: the median of its last ${main.runs.length} landed merge-queue runs (${main.runs.join(', ')})`,
		);
		warnings.push(...driftWarnings(budget, main));
	}
	if (budget.margin && budget.anchors) {
		const percent = (value, base) =>
			`${value >= base ? '+' : ''}${round(((value - base) / base) * 100)}%`;
		const band = (name, value, anchor, level, margin, unit) => {
			const ceiling = round(anchor * (1 + margin));
			const base = level ?? anchor;
			const low = base * (1 - margin);
			const change =
				level === null
					? `${value} ${unit} against an anchor of ${anchor} ${unit} (${percent(value, anchor)}, noise margin ±${round(margin * 100)}%)`
					: `${value} ${unit} against main's median of ${level} ${unit} (${percent(value, level)}, noise margin ±${round(margin * 100)}%; ceiling ${ceiling} ${unit}, the anchor of ${anchor} ${unit} plus the margin)`;
			lines.push(`  ${name}: ${change}`);
			if (value > ceiling)
				failures.push(
					`over budget: ${name} ${change}${level === null ? '' : `, over the ceiling no run may pass`}. Find what made the unit suite heavier; if the cost is intended, re-anchor with a measured reason`,
				);
			else if (value > base * (1 + margin))
				failures.push(
					`over budget: ${name} ${change}, more than the margin above main. Find what made the unit suite heavier; if the cost is intended, re-anchor with a measured reason`,
				);
			else if (value < low)
				warnings.push(
					`lighter: ${name} ${change}, under the band. Nothing fails for it; if main itself moved, main's push runs warn and a re-anchor is due`,
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
		band(
			"total CPU at the anchors' speed",
			cpuS,
			budget.anchors.cpuS,
			main?.cpuS ?? null,
			cpuMargin,
			'CPU-s',
		);
		band(
			'largest shard peak RSS',
			peakRssMb,
			budget.anchors.peakRssMb,
			main?.peakRssMb ?? null,
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

/** One folder per landed run under `dir`, newest first by folder name (`main` writes `<order>-<run id>`). */
export function readMainRuns(dir) {
	return readdirSync(dir)
		.filter((name) => statSync(join(dir, name)).isDirectory())
		.sort()
		.map((name) => ({
			source: name.split('-').at(-1),
			measurements: readMeasurements(join(dir, name)),
		}));
}

/**
 * Downloads into `out` the unit budget measurements of main's newest landed commits whose green merge-queue run
 * measured the unit suite (a queue run whose unit lane hit its marker has none), up to MAIN_RUNS of them. On an API
 * failure it keeps what it has: `check` then holds the run to the committed anchors alone.
 */
function fetchMainRuns(out, ref) {
	const repo = process.env.GITHUB_REPOSITORY ?? 'compiled-run/markless';
	const gh = (...args) =>
		execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
	const got = [];
	try {
		const shas = execFileSync(
			'git',
			['-C', repoRoot, 'rev-list', '--first-parent', '--max-count=200', ref],
			{
				encoding: 'utf8',
			},
		)
			.split('\n')
			.filter(Boolean);
		const runOf = new Map();
		for (let page = 1; page <= 3; page += 1)
			for (const line of gh(
				'api',
				`repos/${repo}/actions/workflows/ci.yml/runs?event=merge_group&status=success&per_page=100&page=${page}`,
				'--jq',
				'.workflow_runs[] | [.head_sha, (.id | tostring)] | join(" ")',
			)
				.split('\n')
				.filter(Boolean)) {
				const [sha, id] = line.split(' ');
				if (!runOf.has(sha)) runOf.set(sha, id);
			}
		mkdirSync(out, { recursive: true });
		for (const sha of shas) {
			if (got.length === MAIN_RUNS) break;
			const id = runOf.get(sha);
			if (!id) continue;
			const names = gh(
				'api',
				`repos/${repo}/actions/runs/${id}/artifacts?per_page=100`,
				'--jq',
				'.artifacts[].name',
			)
				.split('\n')
				.filter((name) => name.startsWith('unit-budget-shard'));
			if (!names.length) continue;
			const dir = join(out, `${String(got.length).padStart(2, '0')}-${id}`);
			gh('run', 'download', id, '--repo', repo, '--pattern', ARTIFACT_PATTERN, '--dir', dir);
			got.push(id);
		}
	} catch (error) {
		console.log(
			`::warning::could not read main's landed runs (${error.message.split('\n')[0]}); kept ${got.length}`,
		);
	}
	return got;
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
		const changedFile = flags(args, '--changed')[0];
		const changed = changedFile
			? new Set(readFileSync(changedFile, 'utf8').split('\n').filter(Boolean))
			: null;
		const mainDir = flags(args, '--main')[0];
		const result = evaluate(
			budget,
			measurements,
			heavy,
			changed,
			mainDir ? readMainRuns(mainDir) : null,
		);
		console.log(result.report);
		for (const warning of result.warnings) console.log(`::warning::${warning}`);
		if (process.env.GITHUB_STEP_SUMMARY)
			appendFileSync(
				process.env.GITHUB_STEP_SUMMARY,
				`### Unit budget\n\n\`\`\`\n${result.report}\n\`\`\`\n${[...result.failures.map((f) => `- error: ${f}`), ...result.warnings.map((w) => `- warning: ${w}`)].join('\n')}\n`,
			);
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
	if (command === 'main') {
		const out = flags(args, '--out')[0];
		if (!out) throw new Error(USAGE);
		const got = fetchMainRuns(resolve(out), flags(args, '--ref')[0] ?? 'origin/main');
		console.log(
			`unit budget: measurements of ${got.length} landed merge-queue runs of main: ${got.join(' ')}`,
		);
		return 0;
	}
	if (command === 'drift') {
		const mainDir = flags(args, '--main')[0];
		if (!mainDir) throw new Error(USAGE);
		const main = mainBaseline(budget, readMainRuns(mainDir));
		if (main.cpuS === null) {
			console.log(
				`::warning::main's last landed runs gave ${main.runs.length} of ${MAIN_RUNS} usable unit budget measurements, so its drift is unknown`,
			);
			return 0;
		}
		console.log(
			`unit budget on main, the median of its last ${main.runs.length} landed runs: ${main.cpuS} CPU-s against an anchor of ${budget.anchors.cpuS}, largest shard peak ${main.peakRssMb} MB against an anchor of ${budget.anchors.peakRssMb}`,
		);
		for (const warning of driftWarnings(budget, main)) console.log(`::warning::${warning}`);
		return 0;
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
