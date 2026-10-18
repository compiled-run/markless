#!/usr/bin/env node
// Cut the next MINOR release: refuse unless HEAD is origin/main with a green CI run, bump every
// release package in lockstep, write the CHANGELOG section, commit, and tag v<X.Y.0>.
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

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const RELEASE_VERSION = /^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)$/u;
const CHANGED_BY_A_CUT = /^(?:package\.json|packages\/.+\/package\.json|CHANGELOG\.md)$/u;

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
		return git('rev-list', '-n', '1', `refs/tags/${tag}`);
	} catch {
		return null;
	}
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

function ciRefusalFor(sha, root) {
	const listed = spawnSync(
		'gh',
		[
			'run',
			'list',
			'--workflow',
			'ci.yml',
			'--branch',
			'main',
			'--event',
			'push',
			'--commit',
			sha,
			'--limit',
			'1',
			'--json',
			'headSha,status,conclusion,url',
		],
		{ cwd: root, encoding: 'utf8' },
	);
	if (listed.status !== 0) {
		return `could not read main's CI runs with gh: ${(listed.stderr ?? '').trim()}`;
	}
	return ciRefusal(JSON.parse(listed.stdout || '[]'), sha);
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
	const currentSha = tagSha(git, currentTag);
	if (currentSha === null) {
		throw new CutError(
			`package.json says ${current} but there is no ${currentTag} tag, so it is unclear what was released`,
		);
	}
	// A tag without a GitHub Release is a cut that stopped after pushing: finish it, never skip it.
	const resume = !githubReleaseExists(currentTag, root);
	const ciProblem = ciRefusalFor(resume ? currentSha : head, root);
	if (ciProblem) refusals.push(ciProblem);
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
		});
		return refusals.length > 0 ? 1 : 0;
	}

	const version = nextMinor(current);
	const tag = `v${version}`;
	if (tagSha(git, tag) !== null) {
		throw new CutError(
			`${tag} already exists while package.json says ${current}; refusing to cut it twice`,
		);
	}

	const scratch = mkdtempSync(path.join(tmpdir(), 'markless-cut-'));
	const workdir = dryRun ? path.join(scratch, 'checkout') : root;
	try {
		if (dryRun) {
			run('git', ['worktree', 'add', '--detach', workdir, head], { cwd: root });
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
				head,
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
		writeOutputs({ version, tag, sha, notes_file: notesFile, resumed: 'false' });
	} finally {
		if (dryRun) {
			spawnSync('git', ['worktree', 'remove', '--force', workdir], {
				cwd: root,
				stdio: 'inherit',
			});
		}
	}

	if (refusals.length > 0) {
		console.error(
			`release-cut: dry run finished, but the real cut would refuse:\n${refusalText(refusals)}`,
		);
		return 1;
	}
	return 0;
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
