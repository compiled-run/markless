// The release cut's refusals, base selection and resume path, against fixture repositories with a fake `gh`.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
	changelogSectionBody,
	ciRefusal,
	insertChangelogSection,
	newestGreenCommit,
	nextMinor,
} from './cut.mjs';

const cutCli = fileURLToPath(new URL('./cut.mjs', import.meta.url));
const fakeGh = fileURLToPath(new URL('./test-support/fake-gh.cjs', import.meta.url));

// A git hook exports these, and they would point fixture commands at the real repository.
const repositoryEnvKeys = [
	'GIT_DIR',
	'GIT_WORK_TREE',
	'GIT_INDEX_FILE',
	'GIT_COMMON_DIR',
	'GIT_OBJECT_DIRECTORY',
	'GIT_ALTERNATE_OBJECT_DIRECTORIES',
	'GIT_PREFIX',
];

function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = {
		...process.env,
		GIT_AUTHOR_NAME: 'Cut Test',
		GIT_AUTHOR_EMAIL: 'cut@example.test',
		GIT_COMMITTER_NAME: 'Cut Test',
		GIT_COMMITTER_EMAIL: 'cut@example.test',
		GIT_CONFIG_GLOBAL: '/dev/null',
		GIT_CONFIG_NOSYSTEM: '1',
		...extra,
	};
	for (const key of repositoryEnvKeys) delete env[key];
	delete env.GITHUB_OUTPUT;
	return env;
}

function git(cwd: string, args: readonly string[]): string {
	const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: cleanEnv() });
	if (result.status !== 0) throw new Error(`git ${args.join(' ')}\n${result.stderr}`);
	return result.stdout.trim();
}

const CHANGELOG =
	'# Changelog\n\nPreamble.\n\n## 1.1.0\n\n### @example/a\n\n- **New:** A thing.\n\n## 1.0.0\n\nOld.\n';

type FixtureOptions = {
	readonly conclusion?: string;
	readonly tagged?: boolean;
	readonly announced?: boolean;
};

/** What the fake `gh` answers; a commit missing from `runs` gets `conclusion`, and null means no run. */
type GitHubState = {
	conclusion: string;
	announced: boolean;
	runs: Record<string, string | null>;
	checks: Record<string, string>;
	statuses: Record<
		string,
		ReadonlyArray<{ context: string; state: string; creator: { login: string } }>
	>;
};

async function cutFixture(
	version: string,
	{ conclusion = 'success', tagged = true, announced = true }: FixtureOptions = {},
) {
	const scratch = await mkdtemp(join(tmpdir(), 'markless-cut-'));
	const work = join(scratch, 'work');
	await mkdir(join(work, 'packages', 'a'), { recursive: true });
	await writeFile(join(work, 'package.json'), `${JSON.stringify({ version }, null, '\t')}\n`);
	await writeFile(join(work, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
	await writeFile(
		join(work, 'packages', 'a', 'package.json'),
		`${JSON.stringify({ name: '@example/a', version }, null, '\t')}\n`,
	);
	await writeFile(join(work, 'CHANGELOG.md'), CHANGELOG);
	git(work, ['init', '-b', 'main']);
	git(work, ['add', '.']);
	git(work, ['commit', '-m', 'Initial commit']);
	if (tagged) git(work, ['tag', '-a', `v${version}`, '-m', `v${version}`]);
	git(scratch, ['clone', '--bare', work, 'origin.git']);
	git(work, ['remote', 'add', 'origin', join(scratch, 'origin.git')]);

	const bin = join(scratch, 'bin');
	await mkdir(bin);
	await writeFile(join(bin, 'gh'), `#!/bin/sh\nexec "${process.execPath}" "${fakeGh}" "$@"\n`);
	await chmod(join(bin, 'gh'), 0o755);
	const github: GitHubState = { conclusion, announced, runs: {}, checks: {}, statuses: {} };
	return { work, bin, github, stateFile: join(scratch, 'github.json') };
}

type Fixture = Awaited<ReturnType<typeof cutFixture>>;

async function commitOnMain(fixture: Fixture, file: string, message: string) {
	await writeFile(join(fixture.work, file), `${message}\n`);
	git(fixture.work, ['add', file]);
	git(fixture.work, ['commit', '-m', message]);
	git(fixture.work, ['push', 'origin', 'HEAD:main']);
	return git(fixture.work, ['rev-parse', 'HEAD']);
}

function runCut(fixture: Fixture, args: readonly string[] = []) {
	writeFileSync(fixture.stateFile, JSON.stringify(fixture.github));
	const result = spawnSync(process.execPath, [cutCli, ...args], {
		cwd: fixture.work,
		encoding: 'utf8',
		env: cleanEnv({
			MARKLESS_REPO_ROOT: fixture.work,
			FAKE_GH_STATE: fixture.stateFile,
			GITHUB_REPOSITORY: 'example/markless',
			PATH: `${fixture.bin}:${process.env.PATH ?? ''}`,
		}),
	});
	return { exitCode: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}

// Each fixture spawns a handful of git and node processes.
const SPAWN_HEAVY_TIMEOUT_MS = 30_000;

describe('release cut helpers', () => {
	test('the next release is always the next minor', () => {
		expect(nextMinor('0.5.0')).toBe('0.6.0');
		expect(nextMinor('0.3.3')).toBe('0.4.0');
		expect(nextMinor('1.9.0')).toBe('1.10.0');
		expect(() => nextMinor('0.6.0-beta.1')).toThrow(/not a plain X\.Y\.Z/u);
	});

	test('only a completed, successful run on the exact commit licenses a release', () => {
		const sha = 'a'.repeat(40);
		const run = { headSha: sha, status: 'completed', conclusion: 'success', url: 'u' };
		expect(ciRefusal([run], sha)).toBeNull();
		expect(ciRefusal([{ ...run, headSha: 'b'.repeat(40) }], sha)).toMatch(/no run/u);
		expect(ciRefusal([{ ...run, status: 'in_progress' }], sha)).toMatch(/still in_progress/u);
		expect(ciRefusal([{ ...run, conclusion: 'failure' }], sha)).toMatch(/ended failure/u);
	});

	test('the base is the newest commit whose run passed and whose required checks came from it', () => {
		const [pending, red, unchecked, green, older] = ['1', '2', '3', '4', '5'].map((digit) =>
			digit.repeat(40),
		);
		const runs: Record<string, { status: string; conclusion: string }> = {
			[pending!]: { status: 'in_progress', conclusion: '' },
			[red!]: { status: 'completed', conclusion: 'failure' },
			[unchecked!]: { status: 'completed', conclusion: 'success' },
			[green!]: { status: 'completed', conclusion: 'success' },
			[older!]: { status: 'completed', conclusion: 'success' },
		};
		const asked: string[] = [];
		const found = newestGreenCommit(
			[pending!, red!, unchecked!, green!, older!],
			(sha: string) => {
				asked.push(sha);
				return { headSha: sha, url: `https://ci.example/${sha[0]}`, ...runs[sha]! };
			},
			(sha: string) => (sha === unchecked ? ['test: no check run on this commit'] : []),
		);
		expect(found.sha).toBe(green);
		expect(found.run.url).toBe('https://ci.example/4');
		expect(asked).toEqual([pending, red, unchecked, green]);
		expect(found.passedOver).toEqual([
			expect.stringContaining('still in_progress'),
			expect.stringContaining('ended failure'),
			`${unchecked!.slice(0, 12)}'s required checks did not pass in https://ci.example/3: test: no check run on this commit`,
		]);
		expect(
			newestGreenCommit(
				[red!],
				() => undefined,
				() => [],
			),
		).toEqual({
			sha: null,
			run: null,
			passedOver: [expect.stringContaining('has no run')],
		});
	});

	test('the new section lands above the newest release and its body is the GitHub Release', () => {
		const next = insertChangelogSection(CHANGELOG, '## 1.2.0\n\n- **Fixed:** B.\n');
		expect(next).toBe(
			'# Changelog\n\nPreamble.\n\n## 1.2.0\n\n- **Fixed:** B.\n\n## 1.1.0\n\n### @example/a\n\n- **New:** A thing.\n\n## 1.0.0\n\nOld.\n',
		);
		expect(changelogSectionBody(next, '1.1.0')).toBe('### @example/a\n\n- **New:** A thing.\n');
		expect(() => changelogSectionBody(next, '9.9.0')).toThrow(/no "## 9\.9\.0" section/u);
	});
});

test('changelog-section.mjs writes the section a publish-mode GitHub Release carries', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'markless-section-'));
	await writeFile(join(directory, 'CHANGELOG.md'), CHANGELOG);
	const cli = fileURLToPath(new URL('./changelog-section.mjs', import.meta.url));
	const out = join(directory, 'notes.md');
	const written = spawnSync(process.execPath, [cli, '1.1.0', out], {
		cwd: directory,
		encoding: 'utf8',
	});
	expect(written.status).toBe(0);
	expect(await readFile(out, 'utf8')).toBe('### @example/a\n\n- **New:** A thing.\n');
	const missing = spawnSync(process.execPath, [cli, '9.9.0', out], {
		cwd: directory,
		encoding: 'utf8',
	});
	expect(missing.status).toBe(1);
	expect(missing.stderr).toContain('CHANGELOG.md has no "## 9.9.0" section');
});

describe('release cut command', () => {
	test('there is no patch or major option', () => {
		const result = spawnSync(process.execPath, [cutCli, '--patch'], {
			encoding: 'utf8',
			env: cleanEnv(),
		});
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('releases the next minor version only');
	});

	test(
		'a dirty checkout is refused before anything is bumped',
		async () => {
			const fixture = await cutFixture('1.1.0');
			const head = git(fixture.work, ['rev-parse', 'HEAD']);
			await writeFile(join(fixture.work, 'CHANGELOG.md'), 'edited\n');
			const result = runCut(fixture);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain('uncommitted changes to tracked files');
			expect(git(fixture.work, ['rev-parse', 'HEAD'])).toBe(head);
			expect(git(fixture.work, ['tag'])).toBe('v1.1.0');
			expect(await readFile(join(fixture.work, 'package.json'), 'utf8')).toContain('1.1.0');
		},
		SPAWN_HEAVY_TIMEOUT_MS,
	);

	test(
		'a red CI run on every main commit since the release is refused',
		async () => {
			const fixture = await cutFixture('1.1.0', { conclusion: 'failure' });
			await commitOnMain(fixture, 'b.txt', 'fix: b');
			const result = runCut(fixture);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain(
				"no main commit since v1.1.0 has a green push CI run with main's required checks (2 checked)",
			);
			expect(result.stdout).toContain('ended failure');
			expect(git(fixture.work, ['tag'])).toBe('v1.1.0');
		},
		SPAWN_HEAVY_TIMEOUT_MS,
	);

	test(
		'a red or unfinished head is passed over for the newest green commit, and the cut reports it',
		async () => {
			const fixture = await cutFixture('1.1.0');
			const green = await commitOnMain(fixture, 'b.txt', 'fix: b');
			const red = await commitOnMain(fixture, 'c.txt', 'fix: c');
			const pending = await commitOnMain(fixture, 'd.txt', 'docs: d');
			fixture.github.runs[red] = 'failure';
			fixture.github.runs[pending] = 'in_progress';
			// Refused for the dirty checkout, after the base is chosen and before anything is bumped.
			await writeFile(join(fixture.work, 'CHANGELOG.md'), 'edited\n');
			const result = runCut(fixture);
			expect(result.exitCode).toBe(1);
			expect(result.stdout).toContain(
				`release-cut: cutting from ${green.slice(0, 12)} "fix: b", whose push CI run https://ci.example/run/${green.slice(0, 7)} passed; main's head ${pending.slice(0, 12)} is 2 commit(s) newer`,
			);
			expect(result.stdout).toContain(`still in_progress`);
			expect(result.stdout).toContain(`${red.slice(0, 12)} ended failure`);
			expect(result.stderr).not.toContain('green push CI run');
		},
		SPAWN_HEAVY_TIMEOUT_MS,
	);

	test(
		'a green run whose required checks did not pass is passed over',
		async () => {
			const fixture = await cutFixture('1.1.0');
			const head = await commitOnMain(fixture, 'b.txt', 'fix: b');
			fixture.github.checks[head] = 'failure';
			await writeFile(join(fixture.work, 'CHANGELOG.md'), 'edited\n');
			const result = runCut(fixture);
			expect(result.stdout).toContain(
				`${head.slice(0, 12)}'s required checks did not pass in https://ci.example/run/${head.slice(0, 7)}: test: failure`,
			);
			expect(result.stdout).toContain('release-cut: cutting from');
			expect(result.stdout).toContain('"Initial commit"');
		},
		SPAWN_HEAVY_TIMEOUT_MS,
	);

	test(
		'a commit older than the current release is never a base',
		async () => {
			const fixture = await cutFixture('1.0.0', { tagged: false });
			const old = git(fixture.work, ['rev-parse', 'HEAD']);
			git(fixture.work, ['checkout', '-b', 'release']);
			await writeFile(
				join(fixture.work, 'package.json'),
				`${JSON.stringify({ version: '1.1.0' }, null, '\t')}\n`,
			);
			git(fixture.work, ['commit', '-am', 'chore(release): v1.1.0']);
			git(fixture.work, ['tag', '-a', 'v1.1.0', '-m', 'v1.1.0']);
			git(fixture.work, ['checkout', 'main']);
			await commitOnMain(fixture, 'b.txt', 'fix: moved on while the release was cut');
			git(fixture.work, ['merge', '--no-ff', '-m', 'Merge release v1.1.0', 'release']);
			git(fixture.work, ['push', 'origin', 'HEAD:main']);
			const merge = git(fixture.work, ['rev-parse', 'HEAD']);
			fixture.github.conclusion = 'failure';
			fixture.github.runs[old] = 'success';
			const result = runCut(fixture);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain('no main commit since v1.1.0 has a green push CI run');
			expect(result.stdout).toContain(`${merge.slice(0, 12)} ended failure`);
			expect(result.stdout).not.toContain(old.slice(0, 12));
		},
		SPAWN_HEAVY_TIMEOUT_MS,
	);

	test(
		'a version that was never tagged is refused rather than skipped',
		async () => {
			const fixture = await cutFixture('1.1.0', { tagged: false });
			const result = runCut(fixture);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain('there is no v1.1.0 tag');
		},
		SPAWN_HEAVY_TIMEOUT_MS,
	);

	test(
		'a merged release commit whose tag was never pushed is tagged and finished',
		async () => {
			const fixture = await cutFixture('1.0.0');
			git(fixture.work, ['checkout', '-b', 'release']);
			await writeFile(
				join(fixture.work, 'package.json'),
				`${JSON.stringify({ version: '1.1.0' }, null, '\t')}\n`,
			);
			await writeFile(
				join(fixture.work, 'packages', 'a', 'package.json'),
				`${JSON.stringify({ name: '@example/a', version: '1.1.0' }, null, '\t')}\n`,
			);
			git(fixture.work, ['commit', '-am', 'chore(release): v1.1.0']);
			const release = git(fixture.work, ['rev-parse', 'HEAD']);
			git(fixture.work, ['checkout', 'main']);
			git(fixture.work, ['merge', '--no-ff', '-m', 'Merge release v1.1.0', 'release']);
			git(fixture.work, ['push', 'origin', 'HEAD:main']);
			const result = runCut(fixture);
			expect(result.stderr).toBe('');
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain('release-cut: resumed=true');
			expect(result.stdout).toContain('release-cut: push_tag=true');
			expect(result.stdout).toContain(`release-cut: sha=${release}`);
			expect(git(fixture.work, ['rev-list', '-n', '1', 'refs/tags/v1.1.0'])).toBe(release);
		},
		SPAWN_HEAVY_TIMEOUT_MS,
	);

	test(
		'a tagged version without a GitHub Release is finished instead of cutting the next one',
		async () => {
			const fixture = await cutFixture('1.1.0', { announced: false });
			const tagged = git(fixture.work, ['rev-parse', 'HEAD']);
			const head = await commitOnMain(fixture, 'later.txt', 'fix: merged after the cut');
			const result = runCut(fixture);
			expect(result.stderr).toBe('');
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain('release-cut: resumed=true');
			expect(result.stdout).toContain('release-cut: version=1.1.0');
			expect(result.stdout).toContain(`release-cut: sha=${tagged}`);
			expect(git(fixture.work, ['rev-parse', 'HEAD'])).toBe(head);
			const notesFile = /release-cut: notes_file=(.+)/u.exec(result.stdout)?.[1] ?? '';
			expect(await readFile(notesFile, 'utf8')).toBe(
				'### @example/a\n\n- **New:** A thing.\n',
			);
		},
		SPAWN_HEAVY_TIMEOUT_MS,
	);

	test(
		'a release commit verified by inherited statuses is finished; one with neither is refused',
		async () => {
			const fixture = await cutFixture('1.1.0', { announced: false });
			const tagged = git(fixture.work, ['rev-parse', 'HEAD']);
			fixture.github.runs[tagged] = 'failure';
			const refused = runCut(fixture);
			expect(refused.exitCode).toBe(1);
			expect(refused.stderr).toContain(
				'ended failure (https://ci.example/run/' +
					`${tagged.slice(0, 7)}); fix main first, and its inherited statuses do not cover main's required checks (test: no commit status on this commit)`,
			);
			fixture.github.statuses[tagged] = [
				{ context: 'test', state: 'success', creator: { login: 'someone' } },
			];
			expect(runCut(fixture).stderr).toContain(
				'test: the commit status was posted by someone, not github-actions[bot]',
			);
			fixture.github.statuses[tagged] = [
				{ context: 'test', state: 'success', creator: { login: 'github-actions[bot]' } },
			];
			const resumed = runCut(fixture);
			expect(resumed.stderr).toBe('');
			expect(resumed.exitCode).toBe(0);
			expect(resumed.stdout).toContain(`release-cut: sha=${tagged}`);
		},
		SPAWN_HEAVY_TIMEOUT_MS,
	);
});
