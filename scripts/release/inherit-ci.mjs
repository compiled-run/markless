#!/usr/bin/env node
// Lets a release commit inherit the green push CI run of the main commit it was cut from, instead of
// running the whole of ci.yml again on a tree CI already passed. It inherits only when diffing the two
// trees proves the release changed nothing but the top-level "version" of package.json files and
// CHANGELOG.md, and the run passed every check main requires; it then posts each required check as a
// commit status on the release commit, linking that run. Otherwise it posts nothing and prints
// inherited=false, and release.yml runs CI on the release pull request as before.
//
// Usage: node scripts/release/inherit-ci.mjs --release <sha> --base <sha> --run <ci run id>
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { repoRoot } from './release-packages.mjs';
import {
	checkRunProblems,
	checkRunsFor,
	gh,
	repository,
	requiredChecks,
} from './required-checks.mjs';

const MANIFEST = /(?:^|\/)package\.json$/u;
const REGULAR_FILE = '100644';

/** The records of `git diff --raw --no-renames -z`, one per changed path. */
export function parseRawDiff(raw) {
	const fields = raw.split('\0');
	if (fields.at(-1) === '') fields.pop();
	const entries = [];
	for (let index = 0; index + 1 < fields.length; index += 2) {
		const [oldMode, newMode, , , status] = fields[index].replace(/^:/u, '').split(' ');
		entries.push({ oldMode, newMode, status, path: fields[index + 1] });
	}
	return entries;
}

function withoutVersion(source) {
	const manifest = JSON.parse(source);
	if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
		throw new Error('is not a JSON object');
	}
	const { version: _version, ...rest } = manifest;
	return rest;
}

/**
 * Why the release tree is more than the base tree with new versions and a new changelog section;
 * empty when it is exactly that. `read(ref, file)` returns a file's text at a commit.
 */
export function releaseDiffProblems(entries, read, base, release) {
	const problems = [];
	if (entries.length === 0) problems.push('the release commit changes nothing');
	for (const { oldMode, newMode, status, path: file } of entries) {
		if (status !== 'M') {
			problems.push(
				`${file}: ${status === 'A' ? 'added' : status === 'D' ? 'deleted' : `status ${status}`}`,
			);
			continue;
		}
		if (oldMode !== REGULAR_FILE || newMode !== REGULAR_FILE) {
			problems.push(`${file}: mode ${oldMode} -> ${newMode}`);
			continue;
		}
		if (file === 'CHANGELOG.md') continue;
		if (!MANIFEST.test(file)) {
			problems.push(`${file}: not a package.json or CHANGELOG.md`);
			continue;
		}
		try {
			if (
				!isDeepStrictEqual(
					withoutVersion(read(base, file)),
					withoutVersion(read(release, file)),
				)
			) {
				problems.push(`${file}: changes more than its "version"`);
			}
		} catch (error) {
			problems.push(`${file}: ${error.message}`);
		}
	}
	return problems;
}

/** Why `run` cannot be inherited for `base`; empty when it is main's green push CI run on it. */
export function runProblems(run, base) {
	const problems = [];
	if (!/(?:^|\/)ci\.yml$/u.test(run.path ?? '')) problems.push(`it is ${run.path}, not ci.yml`);
	if (run.event !== 'push' || run.head_branch !== 'main') {
		problems.push(`it is a ${run.event} run on ${run.head_branch}, not a push to main`);
	}
	if (run.head_sha !== base) problems.push(`it ran on ${run.head_sha}, not ${base}`);
	if (run.status !== 'completed' || run.conclusion !== 'success') {
		problems.push(`it is ${run.status} ${run.conclusion ?? ''}`.trim());
	}
	return problems;
}

/** The commit status each required check gets on the release commit. */
export function inheritedStatuses(required, run, base) {
	return required.map(({ context }) => ({
		context,
		state: 'success',
		target_url: run.html_url,
		description:
			`Inherited from CI run ${run.id} on ${base.slice(0, 12)}: same tree but versions and CHANGELOG`.slice(
				0,
				140,
			),
	}));
}

function options(argv) {
	const values = {};
	for (let index = 0; index < argv.length; index += 2) {
		const key = argv[index]?.replace(/^--/u, '');
		if (!['release', 'base', 'run'].includes(key ?? '') || !argv[index + 1]) {
			throw new Error(
				'usage: node scripts/release/inherit-ci.mjs --release <sha> --base <sha> --run <id>',
			);
		}
		values[key] = argv[index + 1];
	}
	if (!values.release || !values.base || !values.run) {
		throw new Error(
			'usage: node scripts/release/inherit-ci.mjs --release <sha> --base <sha> --run <id>',
		);
	}
	return values;
}

function output(inherited) {
	console.log(`inherit-ci: inherited=${inherited}`);
	if (process.env.GITHUB_OUTPUT)
		appendFileSync(process.env.GITHUB_OUTPUT, `inherited=${inherited}\n`);
}

function main(argv) {
	const { release, base, run: runId } = options(argv);
	const root = process.env.MARKLESS_REPO_ROOT
		? path.resolve(process.env.MARKLESS_REPO_ROOT)
		: repoRoot;
	const git = (...args) =>
		execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
	const releaseSha = git('rev-parse', '--verify', `${release}^{commit}`).trim();
	const baseSha = git('rev-parse', '--verify', `${base}^{commit}`).trim();

	const diff = releaseDiffProblems(
		parseRawDiff(
			git('diff', '--raw', '--no-renames', '--no-abbrev', '-z', baseSha, releaseSha),
		),
		(ref, file) => git('show', `${ref}:${file}`),
		baseSha,
		releaseSha,
	);
	const run = gh(`repos/${repository}/actions/runs/${runId}`);
	const required = requiredChecks();
	const checks = checkRunProblems(required, checkRunsFor(baseSha), new Set([run.check_suite_id]));
	const problems = [
		...diff.map((line) => `tree: ${line}`),
		...runProblems(run, baseSha).map((line) => `run ${runId}: ${line}`),
		...checks.map((line) => `required check ${line}`),
	];
	if (problems.length > 0) {
		console.log(
			`inherit-ci: ${releaseSha.slice(0, 12)} runs its own CI, because it cannot inherit run ${runId}:\n${problems.map((line) => `  - ${line}`).join('\n')}`,
		);
		output(false);
		return 0;
	}
	for (const status of inheritedStatuses(required, run, baseSha)) {
		execFileSync(
			'gh',
			[
				'api',
				'-X',
				'POST',
				`repos/${repository}/statuses/${releaseSha}`,
				...Object.entries(status).flatMap(([key, value]) => ['-f', `${key}=${value}`]),
			],
			{ stdio: ['ignore', 'ignore', 'inherit'] },
		);
		console.log(
			`inherit-ci: ${status.context} on ${releaseSha.slice(0, 12)}: ${status.description}`,
		);
	}
	console.log(
		`inherit-ci: ${releaseSha.slice(0, 12)} differs from ${baseSha.slice(0, 12)} only in package versions and CHANGELOG.md, so it inherits ${run.html_url}`,
	);
	output(true);
	return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	process.exitCode = main(process.argv.slice(2));
}
