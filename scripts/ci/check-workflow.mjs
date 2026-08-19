#!/usr/bin/env node
// Structural check for .github/workflows/ci.yml. The workflow is the merge
// gate, and a typo in a `needs:` name or a lane missing from the `test` gate
// turns the gate green while the work never ran, which no test in this repo
// would catch. Runs with zero dependencies: it parses the YAML through python3
// when pyyaml is available and falls back to a line-level scan otherwise.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workflowPath = resolve(process.argv[2] ?? '.github/workflows/ci.yml');
const source = readFileSync(workflowPath, 'utf8');

// Jobs that existed before the `test` job was split and are deliberately not
// part of the test gate.
const NON_TEST_JOBS = new Set([
	'agent-files',
	'typecheck',
	'package-manager-matrix',
	'changes',
	'benchmark',
	'benchmark-guard',
	// Writes the green markers for the sharded lanes. A cache write is not a
	// check, so a merge must not hang on it.
	'save-lane-markers',
]);

const GATE_JOB = 'test';
const BOX_JOB_PREFIX = 'boxes-';
const LANES_JOB = 'lanes';
const PLAYWRIGHT_JOB = 'prepare-playwright';

// Jobs the gate depends on that are wiring rather than a content-hashed lane.
const GATE_INFRASTRUCTURE = new Set([LANES_JOB, PLAYWRIGHT_JOB]);

// Jobs whose failure skips a lane. The gate reads `skipped` as a content-hash
// hit, so each of these has to reach the gate under its own name.
const SKIP_CAUSING_JOBS = ['typecheck', LANES_JOB, PLAYWRIGHT_JOB];

// `boxes-music-player` -> `boxes_music_player`: GitHub expressions read `-` as
// subtraction, so lane outputs and probe step ids use underscores.
const slugOf = (jobName) => jobName.replace(/-/g, '_');
const wordEnd = '(?![A-Za-z0-9_])';

const problems = [];
const fail = (message) => problems.push(message);

/** @returns {{ jobs: Record<string, any>, concurrency: unknown } | null} */
function parseWithPython() {
	const script = 'import json,sys,yaml;json.dump(yaml.safe_load(open(sys.argv[1])),sys.stdout)';
	const result = spawnSync('python3', ['-c', script, workflowPath], { encoding: 'utf8' });
	if (result.status !== 0 || typeof result.stdout !== 'string' || result.stdout.length === 0)
		return null;
	try {
		const document = JSON.parse(result.stdout);
		if (typeof document !== 'object' || document === null) return null;
		if (typeof document.jobs !== 'object' || document.jobs === null) return null;
		return { jobs: document.jobs, concurrency: document.concurrency };
	} catch {
		return null;
	}
}

const asList = (value) => {
	if (value === undefined || value === null) return [];
	if (Array.isArray(value)) return value.map(String);
	return [String(value)];
};

// Line-level fallback: top-level job keys sit at exactly four spaces under
// `jobs:`, so the shape is readable without a YAML parser.
function parseWithScan() {
	const lines = source.split('\n');
	const jobs = {};
	let current = null;
	let inJobs = false;
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		if (/^jobs:\s*$/.test(line)) {
			inJobs = true;
			continue;
		}
		if (!inJobs) continue;
		if (/^\S/.test(line) && line.trim() !== '') {
			inJobs = false;
			continue;
		}
		const jobMatch = /^ {4}([A-Za-z0-9_.-]+):\s*$/.exec(line);
		if (jobMatch) {
			current = jobMatch[1];
			jobs[current] = { needs: [], body: [], raw: line };
			continue;
		}
		if (current === null) continue;
		jobs[current].body.push(line);
		const needsMatch = /^ {8}needs:\s*(.*)$/.exec(line);
		if (!needsMatch) continue;
		let text = needsMatch[1].trim();
		if (text === '' || text.startsWith('[')) {
			// Flow sequence, possibly spread over several lines.
			let cursor = index;
			while (!text.includes(']') && cursor + 1 < lines.length) {
				cursor += 1;
				const next = lines[cursor];
				if (/^ {8}\S/.test(next) && !next.trim().startsWith('-')) break;
				text += next.trim();
				jobs[current].body.push(next);
			}
			index = cursor;
		}
		jobs[current].needs = text
			.replace(/[[\]]/g, ' ')
			.split(/[,\s]+/)
			.map((name) => name.replace(/^['"]|['"]$/g, ''))
			.filter((name) => name.length > 0);
	}
	return {
		jobs,
		concurrency: /^concurrency:\s*$/m.test(source) ? {} : undefined,
		scanned: true,
	};
}

const parsed = parseWithPython();
const usingScan = parsed === null;
const document = parsed ?? parseWithScan();
const jobs = document.jobs;
const jobNames = Object.keys(jobs);

if (jobNames.length === 0) fail('The workflow declares no jobs.');
if (document.concurrency === undefined)
	fail('The workflow has no top-level `concurrency` block, so pushes pile up on one ref.');

const needsOf = (name) =>
	usingScan ? jobs[name].needs : asList(jobs[name] && jobs[name].needs);

const jobText = (name) => {
	if (usingScan) return jobs[name].body.join('\n');
	return JSON.stringify(jobs[name]);
};

// Declared `outputs:` names. Under the line scan the block sits at eight
// spaces with its entries at twelve.
const outputsOf = (name) => {
	if (!usingScan) return Object.keys((jobs[name] && jobs[name].outputs) || {});
	const block = /^ {8}outputs:\s*$([\s\S]*?)(?=^ {8}\S|$(?![\s\S]))/m.exec(jobText(name));
	if (block === null) return [];
	return [...block[1].matchAll(/^ {12}([A-Za-z0-9_.-]+):/gm)].map((match) => match[1]);
};

// The job-level `if:` expression. The line scan cannot separate a block scalar
// from the rest of the job, so it falls back to the whole job body: a superset,
// which only ever makes the checks below more permissive, never less honest.
const ifOf = (name) => {
	if (!usingScan) return String((jobs[name] && jobs[name].if) ?? '');
	return jobText(name);
};

// 1. Every `needs:` name has to be a real job, or the run silently skips work.
for (const name of jobNames) {
	for (const dependency of needsOf(name)) {
		if (!jobNames.includes(dependency))
			fail(`Job \`${name}\` needs \`${dependency}\`, which is not a job in this workflow.`);
	}
}

// 2. No cycles: a cycle makes the whole workflow fail to load on GitHub.
const state = new Map();
const walk = (name, trail) => {
	if (state.get(name) === 'done') return;
	if (state.get(name) === 'open') {
		fail(`Job dependency cycle: ${[...trail, name].join(' -> ')}`);
		return;
	}
	state.set(name, 'open');
	for (const dependency of needsOf(name)) {
		if (jobNames.includes(dependency)) walk(dependency, [...trail, name]);
	}
	state.set(name, 'done');
};
for (const name of jobNames) walk(name, []);

// 3. Every job needs a wall-clock cap; the 28-minute Playwright hang is why.
for (const name of jobNames) {
	const hasTimeout = usingScan
		? /^ {8}timeout-minutes:/m.test(jobs[name].body.join('\n'))
		: jobs[name] && jobs[name]['timeout-minutes'] !== undefined;
	if (!hasTimeout) fail(`Job \`${name}\` has no \`timeout-minutes\`.`);
}

// 4. Nothing may be advisory: the suite is the merge gate.
if (/continue-on-error/.test(source))
	fail('`continue-on-error` appears in the workflow; no check in this suite may be advisory.');

// 5. The gate job keeps the required-status-check name and must depend on
// every test lane, with `if: always()` so a failed lane still reaches it.
if (!jobNames.includes(GATE_JOB)) {
	fail(`There is no \`${GATE_JOB}\` job; the required status check would disappear.`);
} else {
	const gateNeeds = new Set(needsOf(GATE_JOB));
	const lanes = jobNames.filter((name) => name !== GATE_JOB && !NON_TEST_JOBS.has(name));
	for (const lane of lanes) {
		if (!gateNeeds.has(lane))
			fail(`Job \`${GATE_JOB}\` does not need lane \`${lane}\`, so that lane cannot block a merge.`);
	}
	const gateIf = usingScan
		? /^ {8}if:\s*always\(\)\s*$/m.test(jobs[GATE_JOB].body.join('\n'))
		: String(jobs[GATE_JOB].if ?? '').includes('always()');
	if (!gateIf)
		fail(`Job \`${GATE_JOB}\` must set \`if: always()\` or a failed lane skips the gate instead of failing it.`);
	if (!/needs\.\*\.result/.test(jobText(GATE_JOB)))
		fail(`Job \`${GATE_JOB}\` does not inspect \`needs.*.result\`, so \`if: always()\` would make it pass regardless.`);
	// The gate reads `skipped` as "this lane's content hash already went green",
	// so every job whose failure would skip a lane has to reach the gate under
	// its own name, where it lands as `failure` instead.
	if (!/skipped/.test(jobText(GATE_JOB)))
		fail(`Job \`${GATE_JOB}\` never mentions \`skipped\`, so a lane that hit its content hash would read as a failure.`);
	for (const guard of SKIP_CAUSING_JOBS) {
		if (jobNames.includes(guard) && !gateNeeds.has(guard))
			fail(`Job \`${GATE_JOB}\` does not need \`${guard}\`, whose failure skips lanes the gate would then read as content-hash hits.`);
	}
}

// 6. Receipt aggregation: every box lane must upload, and the receipts job must
// need those lanes and download what they uploaded before it checks them.
const boxJobs = jobNames.filter((name) => name.startsWith(BOX_JOB_PREFIX));
if (boxJobs.length === 0) fail('No `boxes-*` jobs found; the box lanes went missing.');
if (!jobNames.includes('receipts')) {
	fail('No `receipts` job found; nothing validates the analyzer receipt set.');
} else {
	const receiptsNeeds = new Set(needsOf('receipts'));
	const receiptsText = jobText('receipts');
	for (const boxJob of boxJobs) {
		if (!receiptsNeeds.has(boxJob))
			fail(`Job \`receipts\` does not need \`${boxJob}\`, so it would check stale or missing receipts.`);
		const artifact = boxJob.replace(BOX_JOB_PREFIX, 'receipts-');
		if (!new RegExp(`receipts-${boxJob.slice(BOX_JOB_PREFIX.length)}(?![\\w-])`).test(jobText(boxJob)))
			fail(`Job \`${boxJob}\` does not upload an artifact named \`${artifact}\`.`);
		if (!new RegExp(`receipts-${boxJob.slice(BOX_JOB_PREFIX.length)}(?![\\w-])`).test(receiptsText))
			fail(`Job \`receipts\` does not download the \`${artifact}\` artifact.`);
	}
	if (!/receipts:check/.test(receiptsText))
		fail('Job `receipts` never runs `receipts:check`.');
	if (!/analyzer-contract-receipts/.test(receiptsText))
		fail('Job `receipts` never uploads the `analyzer-contract-receipts` artifact.');
	// A skipped box lane uploads nothing, so its receipts have to come back out
	// of the cache entry its last green run saved under the very key whose hit
	// is the reason the lane skipped.
	for (const boxJob of boxJobs) {
		const slug = slugOf(boxJob);
		if (!new RegExp(`needs\\.lanes\\.outputs\\.key_${slug}${wordEnd}`).test(receiptsText))
			fail(`Job \`receipts\` never restores \`${boxJob}\` receipts from \`needs.lanes.outputs.key_${slug}\`, so a skipped box lane would leave the receipt set short.`);
	}
	if (!/fail-on-cache-miss/.test(receiptsText))
		fail('Job `receipts` restores cached receipts without `fail-on-cache-miss`, so a missing cache entry would pass as an empty receipt set.');
}

// 7. Content-hash lanes. A lane may only skip because its key already carries a
// green marker, so each one needs a read-only probe in `lanes`, an `if:` on
// that probe's verdict, and a marker saved under the same key when it wins.
if (jobNames.includes(GATE_JOB) && !jobNames.includes(LANES_JOB)) {
	fail(`There is no \`${LANES_JOB}\` job, so nothing decides which lanes a run can skip.`);
} else if (jobNames.includes(GATE_JOB)) {
	const laneOutputs = new Set(outputsOf(LANES_JOB));
	const lanesText = jobText(LANES_JOB);
	const hashedLanes = needsOf(GATE_JOB).filter(
		(name) =>
			jobNames.includes(name) &&
			name !== GATE_JOB &&
			!GATE_INFRASTRUCTURE.has(name) &&
			!NON_TEST_JOBS.has(name),
	);
	if (hashedLanes.length === 0) fail('The gate depends on no content-hashed lane.');
	for (const lane of hashedLanes) {
		const slug = slugOf(lane);
		if (!laneOutputs.has(`run_${slug}`))
			fail(`Job \`${LANES_JOB}\` has no \`run_${slug}\` output, so lane \`${lane}\` has no content hash to skip on.`);
		if (!laneOutputs.has(`key_${slug}`))
			fail(`Job \`${LANES_JOB}\` has no \`key_${slug}\` output, so lane \`${lane}\` has no key to save a marker under.`);
		if (
			!new RegExp(`steps\\.${slug}\\.outputs\\.cache-hit`).test(lanesText) ||
			!new RegExp(`steps\\.${slug}\\.outputs\\.cache-primary-key`).test(lanesText)
		)
			fail(`Job \`${LANES_JOB}\` has no cache probe with id \`${slug}\` behind the \`${lane}\` outputs.`);
		if (!new RegExp(`needs\\.lanes\\.outputs\\.run_${slug}${wordEnd}`).test(ifOf(lane)))
			fail(`Lane \`${lane}\` does not gate on \`needs.lanes.outputs.run_${slug}\`, so its content hash decides nothing.`);
		const saver = jobNames.find(
			(name) =>
				/actions\/cache\/save/.test(jobText(name)) &&
				new RegExp(`needs\\.lanes\\.outputs\\.key_${slug}${wordEnd}`).test(jobText(name)),
		);
		if (saver === undefined)
			fail(`No job saves a marker under \`needs.lanes.outputs.key_${slug}\`, so lane \`${lane}\` re-runs forever on an unchanged tree.`);
	}
	// Every probe reads: a restore without `lookup-only` would unpack a marker
	// into the workspace, and one that ever wrote would mark work green that
	// never ran.
	const restores = (lanesText.match(/actions\/cache\/restore/g) ?? []).length;
	const probes = (lanesText.match(/lookup-only/g) ?? []).length;
	if (restores < hashedLanes.length)
		fail(`Job \`${LANES_JOB}\` has ${restores} cache probe(s) for ${hashedLanes.length} lane(s).`);
	if (probes !== restores)
		fail(`Job \`${LANES_JOB}\` has ${probes} \`lookup-only\` flag(s) for ${restores} cache probe(s); every probe must be read-only.`);
	if (/actions\/cache\/save/.test(lanesText) || /actions\/cache@/.test(lanesText))
		fail(`Job \`${LANES_JOB}\` writes a cache; a lane's key may only be marked green by the lane that ran.`);
}

// 8. A sharded lane must not save its own marker: one green shard next to a red
// one would let the whole lane skip on the next identical tree.
for (const name of jobNames) {
	const text = jobText(name);
	const sharded = /strategy/.test(text) && /matrix/.test(text) && /shard/.test(text);
	if (sharded && /actions\/cache\/save/.test(text))
		fail(`Sharded lane \`${name}\` saves a cache marker from inside its own matrix, so one green shard could mark a red lane complete.`);
}

// 9. One Chromium download per run: only the prepare job installs a browser
// unconditionally, and anything that installs one shares its cache path.
if (!jobNames.includes(PLAYWRIGHT_JOB)) {
	fail(`There is no \`${PLAYWRIGHT_JOB}\` job; every browser lane would download its own Chromium.`);
} else {
	if (!/PLAYWRIGHT_BROWSERS_PATH/.test(jobText(PLAYWRIGHT_JOB)))
		fail(`Job \`${PLAYWRIGHT_JOB}\` does not set \`PLAYWRIGHT_BROWSERS_PATH\`, so the cache it saves is not the one the lanes read.`);
	for (const name of jobNames) {
		// `install-deps` is per-runner system libraries, not the browser.
		if (!/playwright install(?!-deps)/.test(jobText(name))) continue;
		if (!/PLAYWRIGHT_BROWSERS_PATH/.test(jobText(name)))
			fail(`Job \`${name}\` installs a Playwright browser without \`PLAYWRIGHT_BROWSERS_PATH\`, so it cannot share the prepared cache.`);
		if (name !== PLAYWRIGHT_JOB && !needsOf(name).includes(PLAYWRIGHT_JOB))
			fail(`Job \`${name}\` installs a Playwright browser but does not need \`${PLAYWRIGHT_JOB}\`.`);
	}
}

console.log(`Workflow: ${workflowPath}`);
console.log(`Parsed with: ${usingScan ? 'line scan (python3/pyyaml unavailable)' : 'python3 + pyyaml'}`);
console.log('');
const width = Math.max(...jobNames.map((name) => name.length), 4);
for (const name of jobNames) {
	const needs = needsOf(name);
	console.log(`  ${name.padEnd(width)}  needs: ${needs.length === 0 ? '(none)' : needs.join(', ')}`);
}
console.log('');

if (problems.length > 0) {
	console.error(`${problems.length} workflow problem(s):`);
	for (const problem of problems) console.error(`  - ${problem}`);
	process.exit(1);
}
console.log(`${jobNames.length} jobs check out.`);
