#!/usr/bin/env node
// Lands a verified release commit through main's squashing merge queue and tags the commit that landed.
// A queue entry this workflow's token enqueues gets no CI run, so the queue's commit inherits its
// parent's green run once it is that parent plus versions and CHANGELOG.md only (as in inherit-ci.mjs).
//
// Usage: node scripts/release/land.mjs --tag <vX.Y.0> --release <sha> --cut-from <sha>
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { releaseTagMessage } from './cut.mjs';
import { inheritedStatuses, postStatuses, runProblems, treeProblems } from './inherit-ci.mjs';
import { repoRoot, rootVersion } from './release-packages.mjs';
import {
	checkRunProblems,
	checkRunsFor,
	gh,
	repository,
	requiredChecks,
} from './required-checks.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const QUEUE_PREFIX = 'refs/heads/gh-readonly-queue/main/';
const POLL_MS = 15_000;
// A pull request queued ahead of the release runs its whole CI first.
const LAND_MINUTES = 100;
const OUT_OF_QUEUE_POLLS = 3;
const TRANSIENT_FAILURES = 8;

export class LandError extends Error {}

/** The merge queue's commits for pull request `number`, from `git ls-remote` output. */
export function queueCommitsFrom(lsRemote, number) {
	const prefix = `${QUEUE_PREFIX}pr-${number}-`;
	return lsRemote
		.split('\n')
		.map((line) => line.split('\t'))
		.filter(([sha, ref]) => sha && ref?.startsWith(prefix))
		.map(([sha, ref]) => ({ sha, ref }));
}

/**
 * What to do about a queued commit whose parent is `base`: post the inherited statuses, wait, or give up.
 * `runs` are ci.yml runs on `base`; `checkProblemsFor(run)` lists required checks that run did not pass.
 */
export function queuedCommitVerdict({
	base,
	treeProblems: tree,
	lockstepProblems,
	runs,
	checkProblemsFor,
}) {
	const unverifiable = [
		...tree.map((line) => `tree: ${line}`),
		...lockstepProblems.map((line) => `versions: ${line}`),
	];
	if (unverifiable.length > 0) return { action: 'fail', reasons: unverifiable };
	const reasons = [];
	let running = false;
	for (const run of runs) {
		const problems = [
			...runProblems(run, base, { mergeGroup: true }),
			...(run.status === 'completed' && run.conclusion === 'success'
				? checkProblemsFor(run)
				: []),
		];
		if (problems.length === 0) return { action: 'post', run };
		if (run.status !== 'completed') running = true;
		reasons.push(`run ${run.id}: ${problems.join('; ')}`);
	}
	if (runs.length === 0) reasons.push(`no ci.yml run on ${base.slice(0, 12)} yet`);
	return { action: 'wait', running, reasons };
}

function options(argv) {
	const values = {};
	for (let index = 0; index < argv.length; index += 2) {
		const key = argv[index]?.replace(/^--/u, '');
		if (!['tag', 'release', 'cut-from'].includes(key ?? '') || !argv[index + 1]) {
			throw new LandError(
				'usage: node scripts/release/land.mjs --tag <vX.Y.0> --release <sha> --cut-from <sha>',
			);
		}
		values[key] = argv[index + 1];
	}
	if (!values.tag || !values.release || !values['cut-from']) {
		throw new LandError(
			'usage: node scripts/release/land.mjs --tag <vX.Y.0> --release <sha> --cut-from <sha>',
		);
	}
	return values;
}

function command(name, args, { cwd, env, allowFailure = false } = {}) {
	const result = spawnSync(name, args, {
		cwd,
		env: { ...process.env, ...env },
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	});
	if (result.status !== 0 && !allowFailure) {
		throw new LandError(
			`${name} ${args.join(' ')} exited ${result.status}: ${(result.stderr ?? '').trim()}`,
		);
	}
	return result;
}

function graphql(query, variables) {
	const args = ['api', 'graphql', '-f', `query=${query}`];
	for (const [key, value] of Object.entries(variables)) {
		args.push(typeof value === 'number' ? '-F' : '-f', `${key}=${value}`);
	}
	return JSON.parse(command('gh', args).stdout).data;
}

const [owner, name] = repository.split('/');

function pullRequest(number) {
	return graphql(
		'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){id state isInMergeQueue headRefOid mergeCommit{oid}}}}',
		{ owner, name, number },
	).repository.pullRequest;
}

function openReleasePullRequest(tag, release, cutFrom) {
	const head = `release/${tag}`;
	const listed = JSON.parse(
		command('gh', [
			'pr',
			'list',
			'--base',
			'main',
			'--head',
			head,
			'--state',
			'open',
			'--json',
			'number',
		]).stdout,
	);
	if (listed[0]) return listed[0].number;
	command('gh', [
		'pr',
		'create',
		'--base',
		'main',
		'--head',
		head,
		'--title',
		`chore(release): ${tag}`,
		'--body',
		`The release cut's commit for ${tag}, cut from ${cutFrom}. The cut lands it through main's merge queue and tags the commit that lands.`,
	]);
	const number = JSON.parse(
		command('gh', ['pr', 'view', head, '--json', 'number']).stdout,
	).number;
	const opened = pullRequest(number);
	if (opened.headRefOid !== release) {
		throw new LandError(
			`pull request #${number} is at ${opened.headRefOid}, not the release commit ${release}`,
		);
	}
	return number;
}

async function enqueue(number, release) {
	const { id } = pullRequest(number);
	for (let attempt = 1; ; attempt += 1) {
		const result = command(
			'gh',
			[
				'api',
				'graphql',
				'-f',
				'query=mutation($id:ID!,$oid:GitObjectID!){enqueuePullRequest(input:{pullRequestId:$id,expectedHeadOid:$oid}){mergeQueueEntry{state}}}',
				'-f',
				`id=${id}`,
				'-f',
				`oid=${release}`,
			],
			{ allowFailure: true },
		);
		if (result.status === 0) return id;
		if (attempt === 12) {
			throw new LandError(
				`could not add #${number} to main's merge queue: ${result.stderr.trim()}`,
			);
		}
		console.log(
			`land: #${number} is not in the merge queue yet (${result.stderr.trim()}); retrying`,
		);
		await sleep(10_000);
	}
}

function dequeue(id) {
	command(
		'gh',
		[
			'api',
			'graphql',
			'-f',
			'query=mutation($id:ID!){dequeuePullRequest(input:{id:$id}){clientMutationId}}',
			'-f',
			`id=${id}`,
		],
		{ allowFailure: true },
	);
}

function sleep(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Why the tree of `sha` does not have every release package at `version`; empty when it does. */
function lockstepProblems(git, root, sha, version) {
	const checkout = path.join(mkdtempSync(path.join(tmpdir(), 'markless-land-')), 'checkout');
	git('worktree', 'add', '--detach', checkout, sha);
	try {
		const problems = [];
		const found = rootVersion(checkout);
		if (found !== version) problems.push(`the root package.json says ${found}, not ${version}`);
		const check = command('node', [path.join(scriptDirectory, 'sync-version.mjs'), '--check'], {
			cwd: checkout,
			env: { MARKLESS_REPO_ROOT: checkout },
			allowFailure: true,
		});
		if (check.status !== 0) problems.push(check.stderr.trim());
		return problems;
	} finally {
		spawnSync('git', ['worktree', 'remove', '--force', checkout], { cwd: root });
	}
}

function output(values) {
	for (const [key, value] of Object.entries(values)) console.log(`land: ${key}=${value}`);
	if (process.env.GITHUB_OUTPUT) {
		appendFileSync(
			process.env.GITHUB_OUTPUT,
			Object.entries(values)
				.map(([key, value]) => `${key}=${value}\n`)
				.join(''),
		);
	}
}

async function main(argv) {
	const { tag, release, 'cut-from': cutFrom } = options(argv);
	const version = tag.replace(/^v/u, '');
	const root = process.env.MARKLESS_REPO_ROOT
		? path.resolve(process.env.MARKLESS_REPO_ROOT)
		: repoRoot;
	const git = (...args) => command('git', args, { cwd: root }).stdout.trim();
	const required = requiredChecks();

	const number = openReleasePullRequest(tag, release, cutFrom);
	const id = await enqueue(number, release);
	console.log(`land: #${number} is in main's merge queue`);
	const deadline = Date.now() + LAND_MINUTES * 60_000;
	let verified = null;
	let outOfQueue = 0;
	let transient = 0;
	let landed = null;
	const trees = new Map();
	try {
		while (landed === null) {
			if (Date.now() > deadline) {
				throw new LandError(`#${number} did not land within ${LAND_MINUTES} minutes`);
			}
			try {
				landed = poll();
				transient = 0;
			} catch (error) {
				if (error instanceof LandError || ++transient >= TRANSIENT_FAILURES) throw error;
				console.log(`land: polling failed (${error.message}); retrying`);
			}
			if (landed === null) await sleep(POLL_MS);
		}
	} catch (error) {
		dequeue(id);
		throw error;
	}

	function poll() {
		const state = pullRequest(number);
		if (state.state === 'MERGED') return state.mergeCommit.oid;
		if (state.state !== 'OPEN')
			throw new LandError(`#${number} was ${state.state.toLowerCase()}`);
		outOfQueue = state.isInMergeQueue ? 0 : outOfQueue + 1;
		if (outOfQueue >= OUT_OF_QUEUE_POLLS) {
			throw new LandError(`#${number} was removed from main's merge queue without landing`);
		}
		for (const { sha, ref } of queueCommitsFrom(
			git('ls-remote', 'origin', `${QUEUE_PREFIX}*`),
			number,
		)) {
			if (sha === verified) continue;
			if (!trees.has(sha)) {
				git('fetch', '--quiet', '--no-tags', 'origin', ref);
				const parent = git('rev-parse', `${sha}^1`);
				trees.set(sha, {
					base: parent,
					treeProblems: treeProblems(git, parent, sha),
					lockstepProblems: lockstepProblems(git, root, sha, version),
				});
			}
			const { base, ...tree } = trees.get(sha);
			const runs = gh(
				`repos/${repository}/actions/workflows/ci.yml/runs?head_sha=${base}&per_page=20`,
			).workflow_runs;
			const checkRuns = runs.length > 0 ? checkRunsFor(base) : [];
			const verdict = queuedCommitVerdict({
				base,
				...tree,
				runs,
				checkProblemsFor: (run) =>
					checkRunProblems(required, checkRuns, new Set([run.check_suite_id])),
			});
			if (verdict.action === 'fail') {
				throw new LandError(
					`the merge queue's commit ${sha} for #${number} is not ${base.slice(0, 12)} with the release's versions and CHANGELOG:\n${verdict.reasons.map((line) => `  - ${line}`).join('\n')}`,
				);
			}
			if (verdict.action === 'wait') {
				console.log(
					`land: waiting for ${base.slice(0, 12)}, the parent of the queue's ${sha.slice(0, 12)}, to pass CI: ${verdict.reasons.join('; ')}`,
				);
				continue;
			}
			postStatuses(sha, inheritedStatuses(required, verdict.run, base));
			console.log(
				`land: the queue's ${sha.slice(0, 12)} is ${base.slice(0, 12)} with the release's versions and CHANGELOG, so it inherits ${verdict.run.html_url}`,
			);
			verified = sha;
		}
		return null;
	}

	git('fetch', '--quiet', '--no-tags', 'origin', 'main');
	if (
		spawnSync('git', ['merge-base', '--is-ancestor', landed, 'FETCH_HEAD'], { cwd: root })
			.status !== 0
	) {
		throw new LandError(`#${number} merged as ${landed}, which main does not contain`);
	}
	if (landed !== verified) {
		throw new LandError(
			`#${number} landed as ${landed}, not the queue commit this cut verified (${verified ?? 'none'}); nothing is tagged, and the next cut finishes ${tag}`,
		);
	}
	git('tag', '-a', tag, '-m', releaseTagMessage(tag, cutFrom), landed);
	console.log(`land: main contains ${landed.slice(0, 12)}; tagged it ${tag}`);
	output({ sha: landed, tagged: 'true' });
	return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	try {
		process.exitCode = await main(process.argv.slice(2));
	} catch (error) {
		if (!(error instanceof LandError)) throw error;
		console.error(`land: ${error.message}\nNothing is tagged or published; run the cut again.`);
		process.exitCode = 1;
	}
}
