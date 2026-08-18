// Release-notes CLI against a temporary git fixture. The fixture still
// exercises the production script and a real changelogen install;
// MARKLESS_REPO_ROOT is the only test seam.
import { spawnSync } from 'node:child_process';
import { access, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const releaseNotesCli = fileURLToPath(new URL('./release-notes.mjs', import.meta.url));

const gitIdentityEnv = {
	GIT_AUTHOR_NAME: 'Release Notes Test',
	GIT_AUTHOR_EMAIL: 'release-notes@example.test',
	GIT_COMMITTER_NAME: 'Release Notes Test',
	GIT_COMMITTER_EMAIL: 'release-notes@example.test',
	GIT_CONFIG_GLOBAL: '/dev/null',
	GIT_CONFIG_SYSTEM: '/dev/null',
	GIT_CONFIG_NOSYSTEM: '1',
	LANG: 'C',
};

type NotesResult = {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
};

type NotesFixture = {
	readonly fixture: string;
	readonly conventionalSha: string;
	readonly proseSha: string;
};

function git(fixture: string, args: readonly string[]): string {
	const result = spawnSync('git', args, {
		cwd: fixture,
		encoding: 'utf8',
		env: { ...process.env, ...gitIdentityEnv },
	});
	if (result.status !== 0) {
		throw new Error(`git ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
	}
	return (result.stdout ?? '').trim();
}

async function notesFixture(): Promise<NotesFixture> {
	const fixture = await mkdtemp(join(tmpdir(), 'markless-release-notes-'));
	git(fixture, ['init', '-b', 'main']);
	git(fixture, ['config', 'user.name', 'Release Notes Test']);
	git(fixture, ['config', 'user.email', 'release-notes@example.test']);
	git(fixture, ['remote', 'add', 'origin', 'git@github.com:example/fixture.git']);
	await writeFile(
		join(fixture, 'package.json'),
		`${JSON.stringify({ name: 'fixture', version: '1.0.0' }, null, '\t')}\n`,
	);
	await writeFile(join(fixture, 'README.md'), 'initial\n');
	git(fixture, ['add', 'package.json', 'README.md']);
	git(fixture, ['commit', '-m', 'Initial commit']);
	git(fixture, ['tag', 'v1.0.0']);

	await writeFile(join(fixture, 'feat.txt'), 'feat\n');
	git(fixture, ['add', 'feat.txt']);
	git(fixture, ['commit', '-m', 'feat(core): conventional subject']);
	const conventionalSha = git(fixture, ['rev-parse', 'HEAD']);

	await writeFile(join(fixture, 'prose.txt'), 'prose\n');
	git(fixture, ['add', 'prose.txt']);
	git(fixture, ['commit', '-m', 'Plain prose subject changelogen will not classify']);
	const proseSha = git(fixture, ['rev-parse', 'HEAD']);

	return { fixture, conventionalSha, proseSha };
}

async function runNotes(
	fixture: string,
	args: readonly string[] = [],
	options: { readonly reject?: boolean } = {},
): Promise<NotesResult> {
	const result = spawnSync(process.execPath, [releaseNotesCli, ...args], {
		cwd: fixture,
		encoding: 'utf8',
		env: { ...process.env, ...gitIdentityEnv, MARKLESS_REPO_ROOT: fixture },
	});
	const wrapped: NotesResult = {
		exitCode: result.status ?? 1,
		stdout: result.stdout ?? '',
		stderr: result.stderr ?? '',
	};
	if (options.reject !== false && wrapped.exitCode !== 0) {
		throw new Error(
			`release-notes exited ${wrapped.exitCode}\n${wrapped.stdout}\n${wrapped.stderr}`,
		);
	}
	return wrapped;
}

test('release notes include conventional and unclassified commits', async () => {
	const { fixture, conventionalSha, proseSha } = await notesFixture();
	const result = await runNotes(fixture, ['--from', 'v1.0.0', '--to', 'HEAD']);
	// changelogen capitalizes conventional subjects.
	expect(result.stdout).toContain('Conventional subject');
	expect(result.stdout).toContain('Plain prose subject');
	expect(result.stdout).toContain(conventionalSha.slice(0, 7));
	expect(result.stdout).toContain(proseSha.slice(0, 7));
	expect(result.stderr).toContain('2 covered');
});

test('invalid ranges fail without writing the output file', async () => {
	const { fixture } = await notesFixture();
	const out = join(fixture, 'notes.md');
	const result = await runNotes(
		fixture,
		['--from', 'missing', '--to', 'HEAD', '--out', out],
		{ reject: false },
	);
	expect(result.exitCode).toBe(1);
	await expect(access(out)).rejects.toThrow();
});
