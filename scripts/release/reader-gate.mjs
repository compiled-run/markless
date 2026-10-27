#!/usr/bin/env node
// The real screen readers read main nightly, not on pull requests: a release needs the newest such run it contains green.
// Usage: node scripts/release/reader-gate.mjs --base <commit the release is cut from>
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { gh, repository } from './required-checks.mjs';

export const READER_WORKFLOW = 'screen-reader.yml';
export const READER_EVENTS = new Set(['schedule', 'workflow_dispatch']);
export const MAX_AGE_HOURS = 72;

export function readerGate(runs, contains, now = Date.now(), maxAgeHours = MAX_AGE_HOURS) {
	const run = runs.find((candidate) => READER_EVENTS.has(candidate.event) && contains(candidate.head_sha));
	if (!run)
		return {
			problem: `no nightly or dispatched ${READER_WORKFLOW} run on main reads a commit this release contains; run \`gh workflow run ${READER_WORKFLOW} --ref main\` and cut again once it passes`,
		};
	const hours = (now - Date.parse(run.created_at)) / 3_600_000;
	if (hours > maxAgeHours)
		return {
			run,
			problem: `the newest ${READER_WORKFLOW} run this release contains (${run.html_url}) is ${Math.round(hours)} hours old, past ${maxAgeHours}; run \`gh workflow run ${READER_WORKFLOW} --ref main\` and cut again once it passes`,
		};
	if (run.conclusion !== 'success')
		return { run, problem: `the newest ${READER_WORKFLOW} run this release contains ended ${run.conclusion}: ${run.html_url}` };
	return { run };
}

function completedRunsOnMain() {
	return gh(
		`repos/${repository}/actions/workflows/${READER_WORKFLOW}/runs?branch=main&status=completed&per_page=50`,
	).workflow_runs;
}

function containsCommit(base) {
	return (sha) => {
		try {
			execFileSync('git', ['merge-base', '--is-ancestor', sha, base], { stdio: 'ignore' });
			return true;
		} catch {
			return false;
		}
	};
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	const at = process.argv.indexOf('--base');
	const base = at === -1 ? undefined : process.argv[at + 1];
	if (!base) {
		console.error('usage: node scripts/release/reader-gate.mjs --base <commit>');
		process.exit(2);
	}
	const { run, problem } = readerGate(completedRunsOnMain(), containsCommit(base));
	if (problem) {
		console.error(`::error::${problem}`);
		process.exit(1);
	}
	console.log(`The screen readers passed on ${run.head_sha} (${run.event} run ${run.html_url}), which ${base} contains.`);
}
