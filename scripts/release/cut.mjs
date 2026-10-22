#!/usr/bin/env node
// Cut the next MINOR release from the newest main commit whose push CI run passed main's required
// checks (main's head when that is green): bump every release package in lockstep, write the
// CHANGELOG section, commit on top of that commit, and tag v<X.Y.0>.
// Markless releases minor versions only, so there is no release-type argument to get wrong.
//
// Pushing, publishing and the GitHub Release belong to release.yml's mode=cut jobs.
// --dry-run performs every step in a throwaway worktree (commit hooks included), skips the
// tag, then runs the same pack and publish checks release.yml runs, without touching npm.
//
// When the current version is tagged but has no GitHub Release, the last cut stopped after
// pushing; a rerun finishes that release instead of cutting the next one.
//
// Usage: node scripts/release/cut.mjs [--dry-run]
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { repoRoot, rootVersion } from './release-packages.mjs';
import {
	checkRunProblems,
	checkRunsFor,
	gh,
	repository,
	requiredChecks,
	statusesFor,
	statusProblems,
} from './required-checks.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const RELEASE_VERSION = /^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)$/u;
const CHANGED_BY_A_CUT = /^(?:package\.json|packages\/.+\/package\.json|CHANGELOG\.md)$/u;
const GREEN_SEARCH_DEPTH = 50;

export class CutError extends Error {}

/** The next minor release after `version`: 0.5.0 and 0.5.3 both cut 0.6.0. */
export function nextMinor(version) {
	const match = RELEASE_VERSION.exec(String(version));
	if (!match) {
		throw new CutError(
			`the root version ${String(version)} is not a plain X.Y.Z release version, so the next minor cannot be computed`,
		);
	}
	return `${match.groups.major}.${Number(match.groups.minor) + 1}.0`;
}

/** Why CI does not license releasing `sha`, or null when its latest main run is green. */
export function ciRefusal(runs, sha) {
	const run = runs.find((candidate) => candidate.headSha === sha);
	if (!run) return `main's CI has no run for ${sha.slice(0, 12)} yet`;
	if (run.status !== 'completed')
		return `main's CI run for ${sha.slice(0, 12)} is still ${run.status} (${run.url})`;
	if (run.conclusion !== 'success') {
		return `main's latest CI run for ${sha.slice(0, 12)} ended ${run.conclusion} (${run.url}); fix main first`;
	}
	return null;
}

/**
 * The newest of `candidates` (main's commits, newest first) whose push CI run passed and whose
 * required checks came out of that run, with the reason each newer commit was passed over.
 */
export function newestGreenCommit(candidates, runFor, requiredProblemsFor) {
	const passedOver = [];
	for (const sha of candidates) {
		const run = runFor(sha);
		const refusal = ciRefusal(run ? [run] : [], sha);
		if (refusal) {
			passedOver.push(refusal);
			continue;
		}
		const problems = requiredProblemsFor(sha, run);
		if (problems.length > 0) {
			passedOver.push(
				`${sha.slice(0, 12)}'s required checks did not pass in ${run.url}: ${problems.join('; ')}`,
			);
			continue;
		}
		return { sha, run, passedOver };
	}
	return { sha: null, run: null, passedOver };
}

/** CHANGELOG.md with `section` placed above the newest release, below the preamble. */
export function insertChangelogSection(changelog, section) {
	const heading = /^## /mu.exec(changelog);
	const block = `${section.trim()}\n\n`;
	if (!heading) return `${changelog.trimEnd()}\n\n${block}`;
	return `${changelog.slice(0, heading.index)}${block}${changelog.slice(heading.index)}`;
}

/** The released section for `version` out of CHANGELOG.md, heading excluded. */
export function changelogSectionBody(changelog, version) {
	const lines = changelog.split('\n');
	const start = lines.findIndex((line) => line.trim() === `## ${version}`);
	if (start === -1) throw new CutError(`CHANGELOG.md has no "## ${version}" section`);
	const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
	return `${lines
		.slice(start + 1, end === -1 ? undefined : end)
		.join('\n')
		.trim()}\n`;
}

function run(command, args, { cwd, env } = {}) {
	console.log(`release-cut: $ ${[command, ...args].join(' ')}`);
	const result = spawnSync(command, args, {
		cwd,
		env: { ...process.env, ...env },
		stdio: 'inherit',
	});
	if (result.error) throw new CutError(`${command} could not start: ${result.error.message}`);
	if (result.status !== 0) {
		throw new CutError(`${command} ${args.join(' ')} exited ${result.status}`);
	}
}

function gitIn(cwd) {
	return (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function tagSha(git, tag) {
	try {
		return git('rev-parse', '--quiet', '--verify', `refs/tags/${tag}^{commit}`);
	} catch {
		return null;
	}
}

/** The `chore(release): <tag>` commit `head` merged, when its tag was never pushed; null otherwise. */
function untaggedReleaseCommit(git, head, tag) {
	const subject = `chore(release): ${tag}`;
	const found = git(
		'log',
		'-1',
		'--format=%H%x00%s',
		'--fixed-strings',
		`--grep=${subject}`,
		head,
	);
	const [sha, foundSubject] = found.split('\0');
	return sha && foundSubject === subject ? sha : null;
}

function checkoutRefusals(git) {
	const refusals = [];
	if (git('status', '--porcelain', '--untracked-files=no') !== '') {
		refusals.push('the checkout has uncommitted changes to tracked files');
	}
	git('fetch', '--quiet', '--tags', 'origin', 'main');
	const head = git('rev-parse', 'HEAD');
	const main = git('rev-parse', 'FETCH_HEAD');
	if (head !== main) {
		refusals.push(
			`HEAD ${head.slice(0, 12)} is not origin/main ${main.slice(0, 12)}; releases are cut from main only`,
		);
	}
	return { head, refusals };
}

function latestCiRun(sha, root, filters = []) {
	const listed = spawnSync(
		'gh',
		[
			'run',
			'list',
			'--workflow',
			'ci.yml',
			'--commit',
			sha,
			...filters,
			'--limit',
			'1',
			'--json',
			'databaseId,headSha,status,conclusion,url',
		],
		{ cwd: root, encoding: 'utf8' },
	);
	if (listed.status !== 0) {
		throw new CutError(
			`could not read main's CI runs with gh: ${(listed.stderr ?? '').trim()}`,
		);
	}
	return JSON.parse(listed.stdout || '[]')[0];
}

/** Why a release commit is unverified: neither its own CI run nor the statuses it inherited pass. */
function releaseCommitRefusal(sha, root) {
	const run = latestCiRun(sha, root);
	const refusal = ciRefusal(run ? [run] : [], sha);
	if (!refusal) return null;
	const inherited = statusProblems(requiredChecks(), statusesFor(sha));
	return inherited.length === 0
		? null
		: `${refusal}, and its inherited statuses do not cover main's required checks (${inherited.join('; ')})`;
}

/** Main's first-parent commits from `head` back to the released commit, newest first. */
function releasableCommits(git, root, head, releasedSha) {
	const releasable = [];
	for (const sha of git(
		'rev-list',
		'--first-parent',
		`--max-count=${GREEN_SEARCH_DEPTH}`,
		head,
	).split('\n')) {
		const containsRelease =
			spawnSync('git', ['merge-base', '--is-ancestor', releasedSha, sha], { cwd: root })
				.status === 0;
		if (!containsRelease) break;
		releasable.push(sha);
	}
	return releasable;
}

function greenBase(git, root, head, releasedSha) {
	const required = requiredChecks();
	return newestGreenCommit(
		releasableCommits(git, root, head, releasedSha),
		(sha) => latestCiRun(sha, root, ['--event', 'push', '--branch', 'main']),
		(sha, run) =>
			checkRunProblems(
				required,
				checkRunsFor(sha),
				new Set([gh(`repos/${repository}/actions/runs/${run.databaseId}`).check_suite_id]),
			),
	);
}

function githubReleaseExists(tag, root) {
	return (
		spawnSync('gh', ['release', 'view', tag, '--json', 'tagName'], {
			cwd: root,
			stdio: 'ignore',
		}).status === 0
	);
}

function refusalText(refusals) {
	return refusals.map((line) => `  - ${line}`).join('\n');
}

function writeOutputs(outputs) {
	for (const [key, value] of Object.entries(outputs)) console.log(`release-cut: ${key}=${value}`);
	if (process.env.GITHUB_OUTPUT) {
		appendFileSync(
			process.env.GITHUB_OUTPUT,
			Object.entries(outputs)
				.map(([key, value]) => `${key}=${value}\n`)
				.join(''),
		);
	}
}

function packChecks(cwd, version) {
	run('pnpm', ['build'], { cwd });
	run('node', ['scripts/release/verify-publish-ready.mjs', '--all'], { cwd });
	run('node', ['scripts/release/verify-packed-manifests.mjs'], { cwd });
	run('node', ['scripts/release/publish-workspace.mjs', '--version', version, '--dry-run'], {
		cwd,
		env: { NPM_CONFIG_PROVENANCE: 'false' },
	});
}

export function main(argv) {
	const unknown = argv.filter((arg) => arg !== '--dry-run');
	if (unknown.length > 0) {
		throw new CutError(
			`unknown argument ${unknown.join(' ')}. Markless releases the next minor version only; the only option is --dry-run.`,
		);
	}
	const dryRun = argv.includes('--dry-run');
	const root = process.env.MARKLESS_REPO_ROOT
		? path.resolve(process.env.MARKLESS_REPO_ROOT)
		: repoRoot;
	const git = gitIn(root);

	const { head, refusals } = checkoutRefusals(git);
	const current = rootVersion(root);
	const currentTag = `v${current}`;
	let currentSha = tagSha(git, currentTag);
	let pushTag = false;
	if (currentSha === null) {
		// A cut that merged its release pull request but stopped before pushing the tag.
		currentSha = untaggedReleaseCommit(git, head, currentTag);
		if (currentSha === null) {
			throw new CutError(
				`package.json says ${current} but there is no ${currentTag} tag, so it is unclear what was released`,
			);
		}
		if (!dryRun)
			run('git', ['tag', '-a', currentTag, '-m', currentTag, currentSha], { cwd: root });
		pushTag = true;
	}
	// A tag without a GitHub Release is a cut that stopped after pushing: finish it, never skip it.
	const resume = pushTag || !githubReleaseExists(currentTag, root);
	let base = head;
	let baseRun = null;
	if (resume) {
		const ciProblem = releaseCommitRefusal(currentSha, root);
		if (ciProblem) refusals.push(ciProblem);
	} else {
		const green = greenBase(git, root, head, currentSha);
		for (const line of green.passedOver) console.log(`release-cut: passed over ${line}`);
		if (green.sha === null) {
			refusals.push(
				`no main commit since ${currentTag} has a green push CI run with main's required checks (${green.passedOver.length} checked)`,
			);
		} else {
			base = green.sha;
			baseRun = green.run;
			const newer = green.passedOver.length;
			console.log(
				`release-cut: cutting from ${base.slice(0, 12)} "${git('log', '-1', '--format=%s', base)}", whose push CI run ${baseRun.url} passed; ${newer === 0 ? "it is main's head" : `main's head ${head.slice(0, 12)} is ${newer} commit(s) newer`}`,
			);
		}
	}
	if (refusals.length > 0 && !dryRun) {
		throw new CutError(`refusing to cut a release:\n${refusalText(refusals)}`);
	}
	run('node', [path.join(scriptDirectory, 'sync-version.mjs'), '--check'], {
		cwd: root,
		env: { MARKLESS_REPO_ROOT: root },
	});

	if (resume) {
		const notesFile = path.join(
			mkdtempSync(path.join(tmpdir(), 'markless-cut-')),
			'release-notes.md',
		);
		const changelog = git('show', `${currentSha}:CHANGELOG.md`);
		writeFileSync(notesFile, changelogSectionBody(changelog, current));
		console.log(
			`release-cut: ${currentTag} is tagged but has no GitHub Release; resuming its publish`,
		);
		writeOutputs({
			version: current,
			tag: currentTag,
			sha: currentSha,
			notes_file: notesFile,
			resumed: 'true',
			push_tag: pushTag ? 'true' : 'false',
		});
		return dryRunVerdict(refusals);
	}

	const version = nextMinor(current);
	const tag = `v${version}`;
	if (tagSha(git, tag) !== null) {
		throw new CutError(
			`${tag} already exists while package.json says ${current}; refusing to cut it twice`,
		);
	}

	const scratch = mkdtempSync(path.join(tmpdir(), 'markless-cut-'));
	// The checkout stays at main's head, so release.yml's later steps run main's release scripts.
	const inWorktree = dryRun || base !== head;
	const workdir = inWorktree ? path.join(scratch, 'checkout') : root;
	try {
		if (inWorktree) {
			run('git', ['worktree', 'add', '--detach', workdir, base], { cwd: root });
			run('pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], { cwd: workdir });
		}
		const work = gitIn(workdir);
		run(
			path.join(root, 'node_modules/.bin/bumpp'),
			['package.json', '--release', 'minor', '--yes', '--no-commit', '--no-tag', '--no-push'],
			{ cwd: workdir },
		);
		const bumped = rootVersion(workdir);
		if (bumped !== version) {
			throw new CutError(`bumpp wrote ${bumped}, expected the next minor ${version}`);
		}
		run('node', ['scripts/release/sync-version.mjs'], { cwd: workdir });
		run('node', ['scripts/release/sync-version.mjs', '--check'], { cwd: workdir });

		const sectionFile = path.join(scratch, 'changelog-section.md');
		run(
			'node',
			[
				'scripts/release/release-notes.mjs',
				'--changelog',
				'--version',
				version,
				'--to',
				base,
				'--out',
				sectionFile,
			],
			{ cwd: workdir },
		);
		const section = readFileSync(sectionFile, 'utf8');
		const changelogPath = path.join(workdir, 'CHANGELOG.md');
		writeFileSync(
			changelogPath,
			insertChangelogSection(readFileSync(changelogPath, 'utf8'), section),
		);
		const notesFile = path.join(scratch, 'release-notes.md');
		writeFileSync(
			notesFile,
			changelogSectionBody(readFileSync(changelogPath, 'utf8'), version),
		);

		const changed = work('diff', '--name-only').split('\n').filter(Boolean);
		const unexpected = changed.filter((file) => !CHANGED_BY_A_CUT.test(file));
		if (unexpected.length > 0) {
			throw new CutError(
				`the bump changed files a release commit must not touch: ${unexpected.join(', ')}`,
			);
		}
		run('git', ['add', '--', ...changed], { cwd: workdir });
		run('git', ['commit', '-m', `chore(release): ${tag}`], { cwd: workdir });
		const sha = work('rev-parse', 'HEAD');

		if (dryRun) {
			console.log(
				`release-cut: dry run, so ${tag} is not tagged; the real cut tags ${sha.slice(0, 12)}`,
			);
			console.log(`\n${section}`);
			packChecks(workdir, version);
		} else {
			run('git', ['tag', '-a', tag, '-m', tag], { cwd: workdir });
		}
		writeOutputs({
			version,
			tag,
			sha,
			base,
			base_run: baseRun?.url ?? '',
			base_run_id: baseRun?.databaseId ?? '',
			notes_file: notesFile,
			resumed: 'false',
			push_tag: dryRun ? 'false' : 'true',
		});
	} finally {
		if (inWorktree) {
			spawnSync('git', ['worktree', 'remove', '--force', workdir], {
				cwd: root,
				stdio: 'inherit',
			});
		}
	}

	return dryRunVerdict(refusals);
}

function dryRunVerdict(refusals) {
	if (refusals.length === 0) return 0;
	console.error(
		`release-cut: dry run finished, but the real cut would refuse:\n${refusalText(refusals)}`,
	);
	return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	try {
		process.exitCode = main(process.argv.slice(2));
	} catch (error) {
		if (!(error instanceof CutError)) throw error;
		console.error(`release-cut: ${error.message}`);
		process.exitCode = 1;
	}
}
