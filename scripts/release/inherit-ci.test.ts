// A release commit inherits its base's green CI run only when diffing the trees proves it changed versions and the changelog alone.
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
	inheritedStatuses,
	parseRawDiff,
	releaseDiffProblems,
	runProblems,
} from './inherit-ci.mjs';

const inheritCli = fileURLToPath(new URL('./inherit-ci.mjs', import.meta.url));
const fakeGh = fileURLToPath(new URL('./test-support/fake-gh.cjs', import.meta.url));

const env: NodeJS.ProcessEnv = {
	...process.env,
	GIT_AUTHOR_NAME: 'Inherit Test',
	GIT_AUTHOR_EMAIL: 'inherit@example.test',
	GIT_COMMITTER_NAME: 'Inherit Test',
	GIT_COMMITTER_EMAIL: 'inherit@example.test',
	GIT_CONFIG_GLOBAL: '/dev/null',
	GIT_CONFIG_NOSYSTEM: '1',
};
// A git hook exports these, and they would point fixture commands at the real repository.
for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_PREFIX'])
	delete env[key];

function git(cwd: string, args: readonly string[]): string {
	const result = spawnSync('git', args, { cwd, encoding: 'utf8', env });
	if (result.status !== 0) throw new Error(`git ${args.join(' ')}\n${result.stderr}`);
	return result.stdout;
}

const manifest = (fields: Record<string, unknown>) => `${JSON.stringify(fields, null, '\t')}\n`;

async function repository() {
	const work = await mkdtemp(join(tmpdir(), 'markless-inherit-'));
	await mkdir(join(work, 'packages', 'a'), { recursive: true });
	await writeFile(join(work, 'package.json'), manifest({ name: 'root', version: '0.8.0' }));
	await writeFile(
		join(work, 'packages', 'a', 'package.json'),
		manifest({ name: '@example/a', version: '0.8.0', dependencies: { b: '^1.0.0' } }),
	);
	await writeFile(join(work, 'CHANGELOG.md'), '# Changelog\n\n## 0.8.0\n');
	await writeFile(join(work, 'index.js'), 'export {};\n');
	git(work, ['init', '-q', '-b', 'main']);
	git(work, ['add', '.']);
	git(work, ['commit', '-q', '-m', 'base']);
	const base = git(work, ['rev-parse', 'HEAD']).trim();
	return { work, base };
}

async function release(work: string, base: string, edit: () => Promise<void>) {
	git(work, ['checkout', '-q', '--detach', base]);
	await writeFile(join(work, 'package.json'), manifest({ name: 'root', version: '0.9.0' }));
	await writeFile(
		join(work, 'packages', 'a', 'package.json'),
		manifest({ name: '@example/a', version: '0.9.0', dependencies: { b: '^1.0.0' } }),
	);
	await writeFile(join(work, 'CHANGELOG.md'), '# Changelog\n\n## 0.9.0\n\n- New.\n\n## 0.8.0\n');
	await edit();
	git(work, ['add', '-A']);
	git(work, ['commit', '-q', '-m', 'chore(release): v0.9.0']);
	const sha = git(work, ['rev-parse', 'HEAD']).trim();
	return releaseDiffProblems(
		parseRawDiff(git(work, ['diff', '--raw', '--no-renames', '--no-abbrev', '-z', base, sha])),
		(ref: string, path: string) => git(work, ['show', `${ref}:${path}`]),
		base,
		sha,
	);
}

const SPAWN_HEAVY_TIMEOUT_MS = 30_000;

describe('the release tree against its base tree', () => {
	test(
		'new versions and a new changelog section inherit',
		async () => {
			const { work, base } = await repository();
			expect(await release(work, base, async () => {})).toEqual([]);
		},
		SPAWN_HEAVY_TIMEOUT_MS,
	);

	test(
		'reformatting a manifest without changing a field still inherits',
		async () => {
			const { work, base } = await repository();
			const problems = await release(work, base, async () => {
				await writeFile(
					join(work, 'package.json'),
					`${JSON.stringify({ name: 'root', version: '0.9.0' }, null, 2)}\n`,
				);
			});
			expect(problems).toEqual([]);
		},
		SPAWN_HEAVY_TIMEOUT_MS,
	);

	test(
		'any other change runs CI instead, and says why',
		async () => {
			const { work, base } = await repository();
			const problems = await release(work, base, async () => {
				await writeFile(
					join(work, 'packages', 'a', 'package.json'),
					manifest({
						name: '@example/a',
						version: '0.9.0',
						dependencies: { b: '^2.0.0' },
					}),
				);
				await writeFile(join(work, 'index.js'), 'export const changed = true;\n');
				await writeFile(join(work, 'new.js'), 'export {};\n');
				await chmod(join(work, 'CHANGELOG.md'), 0o755);
			});
			expect(problems).toEqual([
				'CHANGELOG.md: mode 100644 -> 100755',
				'index.js: not a package.json or CHANGELOG.md',
				'new.js: added',
				'packages/a/package.json: changes more than its "version"',
			]);
		},
		SPAWN_HEAVY_TIMEOUT_MS,
	);

	test(
		'a manifest that stops parsing, a deleted file and a nested changelog run CI',
		async () => {
			const { work, base } = await repository();
			const problems = await release(work, base, async () => {
				await writeFile(
					join(work, 'package.json'),
					'{ "name": "root", "version": "0.9.0",\n',
				);
				spawnSync('rm', [join(work, 'index.js')]);
				await writeFile(join(work, 'packages', 'a', 'CHANGELOG.md'), 'nested\n');
			});
			expect(problems).toEqual([
				'index.js: deleted',
				expect.stringMatching(/^package\.json: /u),
				'packages/a/CHANGELOG.md: added',
			]);
		},
		SPAWN_HEAVY_TIMEOUT_MS,
	);

	test('an empty diff is not a release', () => {
		expect(releaseDiffProblems([], () => '', 'a', 'b')).toEqual([
			'the release commit changes nothing',
		]);
	});
});

describe('inherit-ci command', () => {
	async function runInherit(edit: (work: string) => Promise<void>, conclusion = 'success') {
		const { work, base } = await repository();
		await release(work, base, () => edit(work));
		const sha = git(work, ['rev-parse', 'HEAD']).trim();
		const scratch = await mkdtemp(join(tmpdir(), 'markless-inherit-gh-'));
		const bin = join(scratch, 'bin');
		await mkdir(bin);
		await writeFile(
			join(bin, 'gh'),
			`#!/bin/sh\nexec "${process.execPath}" "${fakeGh}" "$@"\n`,
		);
		await chmod(join(bin, 'gh'), 0o755);
		const posted = join(scratch, 'posted.jsonl');
		await writeFile(posted, '');
		await writeFile(
			join(scratch, 'github.json'),
			JSON.stringify({
				announced: true,
				conclusion: 'success',
				runs: {},
				checks: {},
				statuses: {},
				posted,
				run: {
					id: 41,
					path: '.github/workflows/ci.yml',
					event: 'push',
					head_branch: 'main',
					head_sha: base,
					status: 'completed',
					conclusion,
					html_url: 'https://ci.example/run/41',
				},
			}),
		);
		const result = spawnSync(
			process.execPath,
			[inheritCli, '--release', sha, '--base', base, '--run', '41'],
			{
				encoding: 'utf8',
				env: {
					...env,
					MARKLESS_REPO_ROOT: work,
					FAKE_GH_STATE: join(scratch, 'github.json'),
					GITHUB_REPOSITORY: 'example/markless',
					PATH: `${bin}:${process.env.PATH ?? ''}`,
				},
			},
		);
		const statuses = (await readFile(posted, 'utf8'))
			.split('\n')
			.filter(Boolean)
			.map((line) => JSON.parse(line) as Record<string, string>);
		return { sha, base, result, statuses };
	}

	test(
		'a versions-only release gets every required check as a status linking the run',
		async () => {
			const { sha, base, result, statuses } = await runInherit(async () => {});
			expect(result.stderr).toBe('');
			expect(result.status).toBe(0);
			expect(result.stdout).toContain('inherit-ci: inherited=true');
			expect(statuses).toEqual([
				{
					path: `repos/example/markless/statuses/${sha}`,
					context: 'test',
					state: 'success',
					target_url: 'https://ci.example/run/41',
					description: `Inherited from CI run 41 on ${base.slice(0, 12)}: same tree but versions and CHANGELOG`,
				},
			]);
		},
		SPAWN_HEAVY_TIMEOUT_MS,
	);

	test(
		'a release with any other change, or a run that did not pass, posts nothing',
		async () => {
			const changed = await runInherit(async (work) => {
				await writeFile(join(work, 'index.js'), 'export const changed = true;\n');
			});
			expect(changed.result.status).toBe(0);
			expect(changed.result.stdout).toContain(
				'tree: index.js: not a package.json or CHANGELOG.md',
			);
			expect(changed.result.stdout).toContain('inherit-ci: inherited=false');
			expect(changed.statuses).toEqual([]);
			const red = await runInherit(async () => {}, 'failure');
			expect(red.result.status).toBe(0);
			expect(red.result.stdout).toContain('run 41: it is completed failure');
			expect(red.result.stdout).toContain('inherit-ci: inherited=false');
			expect(red.statuses).toEqual([]);
		},
		SPAWN_HEAVY_TIMEOUT_MS,
	);
});

describe('the run a release inherits', () => {
	const base = 'b'.repeat(40);
	const run = {
		id: 39731666382,
		path: '.github/workflows/ci.yml',
		event: 'push',
		head_branch: 'main',
		head_sha: base,
		status: 'completed',
		conclusion: 'success',
		html_url: 'https://github.com/example/markless/actions/runs/39731666382',
	};

	test("only main's green ci.yml push run on the base commit", () => {
		expect(runProblems(run, base)).toEqual([]);
		expect(runProblems({ ...run, path: '.github/workflows/ecosystem-ci.yml' }, base)).toEqual([
			'it is .github/workflows/ecosystem-ci.yml, not ci.yml',
		]);
		expect(
			runProblems({ ...run, event: 'pull_request', head_branch: 'release/v0.9.0' }, base),
		).toEqual(['it is a pull_request run on release/v0.9.0, not a push to main']);
		expect(runProblems({ ...run, head_sha: 'c'.repeat(40) }, base)).toEqual([
			`it ran on ${'c'.repeat(40)}, not ${base}`,
		]);
		expect(runProblems({ ...run, conclusion: 'failure' }, base)).toEqual([
			'it is completed failure',
		]);
	});

	test('each required check becomes a success status that links the run', () => {
		const statuses = inheritedStatuses(
			[
				{ context: 'test', app_id: 15368 },
				{ context: 'typecheck', app_id: 15368 },
			],
			run,
			base,
		);
		expect(statuses).toEqual([
			{
				context: 'test',
				state: 'success',
				target_url: run.html_url,
				description: `Inherited from CI run 39731666382 on ${base.slice(0, 12)}: same tree but versions and CHANGELOG`,
			},
			expect.objectContaining({ context: 'typecheck', state: 'success' }),
		]);
		for (const status of statuses) expect(status.description.length).toBeLessThanOrEqual(140);
	});
});
