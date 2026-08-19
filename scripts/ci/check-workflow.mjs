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
]);

const GATE_JOB = 'test';
const BOX_JOB_PREFIX = 'boxes-';

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
