#!/usr/bin/env node
// Structural check for .github/workflows/ci.yml. The workflow is the merge
// gate, and a typo in a `needs:` name or a lane missing from the `test` gate
// turns the gate green while the work never ran, which no test in this repo
// would catch. The workflow is parsed, never pattern-matched: a text scan has
// its own idea of the shape, so it can pass a workflow the parser would reject
// and disagree with itself about what a job's `if:` even says.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const workflowPath = resolve(process.argv[2] ?? resolve(repoRoot, '.github/workflows/ci.yml'));
const source = readFileSync(workflowPath, 'utf8');

// `yaml` is a workspace dependency of @markless/cli. pnpm's isolated layout
// keeps it out of the root node_modules, so the package that declares it is
// the second resolution base.
const loadYaml = () => {
	for (const base of ['package.json', 'packages/cli/package.json']) {
		try {
			return createRequire(resolve(repoRoot, base))('yaml');
		} catch {
			continue;
		}
	}
	return null;
};

const yaml = loadYaml();
if (yaml === null) {
	console.error(
		`Cannot resolve the \`yaml\` package from ${repoRoot}. Run \`pnpm install\` and try again: this check parses the workflow and has no pattern-matching fallback to degrade to.`,
	);
	process.exit(1);
}

// Jobs that existed before the `test` job was split and are deliberately not
// part of the test gate. `package-manager-matrix` and `benchmark-guard` are
// intended to block on their own as separate status checks - making them
// required is a pending repository-settings action, since `main` has no branch
// protection today. They are not gate members because neither ran inside the
// serial `test` job either, and folding a 30-minute benchmark into the gate
// would make every merge wait on it.
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

const asList = (value) => {
	if (value === undefined || value === null) return [];
	if (Array.isArray(value)) return value.map(String);
	return [String(value)];
};

let document;
try {
	document = yaml.parse(source);
} catch (error) {
	console.error(`${workflowPath} is not valid YAML: ${error.message}`);
	process.exit(1);
}
if (typeof document !== 'object' || document === null) {
	console.error(`${workflowPath} does not parse to a workflow document.`);
	process.exit(1);
}
if (typeof document.jobs !== 'object' || document.jobs === null) {
	console.error(`${workflowPath} declares no \`jobs:\` mapping.`);
	process.exit(1);
}

const jobs = document.jobs;
const jobNames = Object.keys(jobs);

if (jobNames.length === 0) fail('The workflow declares no jobs.');
if (document.concurrency === undefined)
	fail('The workflow has no top-level `concurrency` block, so pushes pile up on one ref.');

const needsOf = (name) => asList(jobs[name] && jobs[name].needs);

// The whole job as text, for the checks that ask whether an expression or a
// command appears anywhere inside it.
const jobText = (name) => JSON.stringify(jobs[name]);

const outputsOf = (name) => Object.keys((jobs[name] && jobs[name].outputs) || {});

const stepsOf = (name) => {
	const steps = jobs[name] && jobs[name].steps;
	return Array.isArray(steps) ? steps : [];
};

const usesAction = (step, action) =>
	typeof step === 'object' &&
	step !== null &&
	typeof step.uses === 'string' &&
	step.uses.startsWith(action);

const withOf = (step) => (typeof step.with === 'object' && step.with !== null ? step.with : {});

// The job-level `if:` expression, and only that: a step's `if:` answers a
// different question and must never satisfy a check about the job.
const ifOf = (name) => String((jobs[name] && jobs[name].if) ?? '');

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
	if (jobs[name] === null || jobs[name]['timeout-minutes'] === undefined)
		fail(`Job \`${name}\` has no \`timeout-minutes\`.`);
}

// 4. Nothing may be advisory: the suite is the merge gate. Comment lines drop
// out first, so the ban can be written down next to the rule it protects, and
// only a truthy value fails: `continue-on-error: false` restates the default
// and weakens nothing.
const uncommented = source
	.split('\n')
	.filter((line) => !/^\s*#/.test(line))
	.join('\n');
if (/^\s*continue-on-error:\s*(?!false\s*$)\S/m.test(uncommented))
	fail('`continue-on-error` is set in the workflow; no check in this suite may be advisory.');

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
	// The parsed job-level value, so `${{ always() }}` and the bare `always()`
	// both pass and a step's `if:` cannot stand in for the job's.
	if (!ifOf(GATE_JOB).includes('always()'))
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
	// `fail-on-cache-miss` has to be set to true, not merely mentioned: the
	// key's default is false, and false is exactly the value that would turn a
	// missing receipt set into a silent pass.
	const receiptRestores = stepsOf('receipts').filter((step) =>
		usesAction(step, 'actions/cache/restore'),
	);
	if (receiptRestores.length < boxJobs.length)
		fail(`Job \`receipts\` has ${receiptRestores.length} cache restore step(s) for ${boxJobs.length} box lane(s); a skipped lane would leave the receipt set short.`);
	for (const step of receiptRestores) {
		if (withOf(step)['fail-on-cache-miss'] !== true)
			fail(`Job \`receipts\` restores \`${step.name ?? 'a cache entry'}\` without \`fail-on-cache-miss: true\`, so a missing cache entry would pass as an empty receipt set.`);
	}
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
	{
		const restoreSteps = stepsOf(LANES_JOB).filter((step) =>
			usesAction(step, 'actions/cache/restore'),
		);
		if (restoreSteps.length < hashedLanes.length)
			fail(`Job \`${LANES_JOB}\` has ${restoreSteps.length} cache probe(s) for ${hashedLanes.length} lane(s).`);
		for (const step of restoreSteps) {
			if (withOf(step)['lookup-only'] !== true)
				fail(`Probe \`${step.name ?? step.id ?? 'unnamed'}\` in \`${LANES_JOB}\` does not set \`lookup-only: true\`, so it unpacks a marker instead of only reading whether one exists.`);
		}
	}
	// Every lane key layers on the shared input hash. A lane key that stopped
	// reading `ci-base-key.txt` would skip on a tree whose sources changed.
	const layered = (lanesText.match(/hashFiles\('ci-base-key\.txt'/g) ?? []).length;
	if (layered < hashedLanes.length)
		fail(`Job \`${LANES_JOB}\` layers ${layered} lane key(s) on \`ci-base-key.txt\` for ${hashedLanes.length} lane(s); a lane key that drops the shared hash skips on changed sources.`);
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

// 10. Token posture. Nothing in this workflow pushes, comments or publishes,
// so the default token stays read-only and no checkout leaves credentials in
// `.git/config` for a later step to pick up.
if (document.permissions === undefined) {
	fail('The workflow has no top-level `permissions:` block, so every job runs with the default token scope.');
} else if (document.permissions === 'read-all') {
	// The string form grants read on every scope; nothing here needs more.
} else if (typeof document.permissions !== 'object' || document.permissions === null) {
	fail('The top-level `permissions:` value is neither a scope map nor `read-all`, so its effective grants cannot be validated.');
} else {
	if (document.permissions.contents !== 'read')
		fail('Top-level `permissions.contents` must be `read`: nothing in this workflow pushes, and a wider grant would survive every later edit unnoticed.');
	for (const [scope, level] of Object.entries(document.permissions)) {
		if (level === 'write')
			fail(`Top-level \`permissions.${scope}: write\` hands a write-capable token to every job; nothing in this workflow needs one.`);
	}
}
for (const name of jobNames) {
	for (const step of stepsOf(name)) {
		if (!usesAction(step, 'actions/checkout')) continue;
		if (withOf(step)['persist-credentials'] !== false)
			fail(`Job \`${name}\` checks out without \`persist-credentials: false\`, so the token stays in \`.git/config\` for every later step.`);
	}
}

// 11. This checker only protects the workflow if the workflow runs it - as a
// parsed `run` step in `typecheck`, after the install that provides the `yaml`
// package it parses with. A source-text scan would stay green on a comment.
{
	const typecheckSteps = stepsOf('typecheck');
	const runLine = (step) =>
		typeof step === 'object' && step !== null && typeof step.run === 'string' ? step.run : '';
	const checkerIndex = typecheckSteps.findIndex((step) =>
		runLine(step).includes('node scripts/ci/check-workflow.mjs .github/workflows/ci.yml'),
	);
	const installIndex = typecheckSteps.findIndex((step) =>
		runLine(step).includes('pnpm install --frozen-lockfile'),
	);
	if (checkerIndex === -1)
		fail('The `typecheck` job has no `run` step invoking `node scripts/ci/check-workflow.mjs .github/workflows/ci.yml`, so none of these invariants are enforced in CI.');
	else if (installIndex === -1 || checkerIndex < installIndex)
		fail('The checker step in `typecheck` must come after `pnpm install --frozen-lockfile`: it resolves the `yaml` package from node_modules.');
}

console.log(`Workflow: ${workflowPath}`);
console.log('Parsed with: the `yaml` package');
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
