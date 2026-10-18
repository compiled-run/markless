// The release cut's refusals and resume path, against fixture repositories with a fake `gh`.
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { changelogSectionBody, ciRefusal, insertChangelogSection, nextMinor } from './cut.mjs';

const cutCli = fileURLToPath(new URL('./cut.mjs', import.meta.url));

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
	await writeFile(
		join(bin, 'gh'),
		`#!/usr/bin/env node
if (process.argv[2] === 'release') process.exit(${announced ? 0 : 1});
const sha = process.argv[process.argv.indexOf('--commit') + 1];
process.stdout.write(JSON.stringify([{ headSha: sha, status: 'completed', conclusion: ${JSON.stringify(conclusion)}, url: 'https://ci.example/run' }]));
`,
	);
	await chmod(join(bin, 'gh'), 0o755);
	return { work, bin };
}

function runCut(fixture: { work: string; bin: string }, args: readonly string[] = []) {
	const result = spawnSync(process.execPath, [cutCli, ...args], {
		cwd: fixture.work,
		encoding: 'utf8',
		env: cleanEnv({
			MARKLESS_REPO_ROOT: fixture.work,
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

	test('the new section lands above the newest release and its body is the GitHub Release', () => {
		const next = insertChangelogSection(CHANGELOG, '## 1.2.0\n\n- **Fixed:** B.\n');
		expect(next).toBe(
			'# Changelog\n\nPreamble.\n\n## 1.2.0\n\n- **Fixed:** B.\n\n## 1.1.0\n\n### @example/a\n\n- **New:** A thing.\n\n## 1.0.0\n\nOld.\n',
		);
		expect(changelogSectionBody(next, '1.1.0')).toBe('### @example/a\n\n- **New:** A thing.\n');
		expect(() => changelogSectionBody(next, '9.9.0')).toThrow(/no "## 9\.9\.0" section/u);
	});
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
		'a red CI run on main is refused',
		async () => {
			const fixture = await cutFixture('1.1.0', { conclusion: 'failure' });
			const result = runCut(fixture);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain('ended failure');
			expect(git(fixture.work, ['tag'])).toBe('v1.1.0');
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
		'a tagged version without a GitHub Release is finished instead of cutting the next one',
		async () => {
			const fixture = await cutFixture('1.1.0', { announced: false });
			const tagged = git(fixture.work, ['rev-parse', 'HEAD']);
			await writeFile(join(fixture.work, 'later.txt'), 'merged after the cut\n');
			git(fixture.work, ['add', 'later.txt']);
			git(fixture.work, ['commit', '-m', 'fix: merged after the cut']);
			git(fixture.work, ['push', 'origin', 'HEAD:main']);
			const head = git(fixture.work, ['rev-parse', 'HEAD']);
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
});
