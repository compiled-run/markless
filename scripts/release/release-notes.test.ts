// Release-notes CLI against a temporary git fixture. The fixture still
// exercises the production script and a real changelogen install;
// MARKLESS_REPO_ROOT is the only test seam.
import { spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
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

// A git hook exports GIT_DIR (absolute inside a linked worktree), which would point fixture
// commands at the real repository instead of the temp fixture.
const repositoryEnvKeys = [
	'GIT_DIR',
	'GIT_WORK_TREE',
	'GIT_INDEX_FILE',
	'GIT_COMMON_DIR',
	'GIT_OBJECT_DIRECTORY',
	'GIT_ALTERNATE_OBJECT_DIRECTORIES',
	'GIT_PREFIX',
];

function fixtureEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = { ...process.env, ...gitIdentityEnv, ...extra };
	for (const key of repositoryEnvKeys) delete env[key];
	return env;
}

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
		env: fixtureEnv(),
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
		env: fixtureEnv({ MARKLESS_REPO_ROOT: fixture }),
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

// Each case spawns about a dozen git and node processes; 10.9 s was measured under full-suite load.
const SPAWN_HEAVY_TIMEOUT_MS = 30_000;

test('fixture git commands ignore a GIT_DIR inherited from a git hook', async () => {
	const outer = await mkdtemp(join(tmpdir(), 'markless-release-notes-outer-'));
	spawnSync('git', ['init', '-b', 'main'], { cwd: outer, env: fixtureEnv() });
	const outerConfig = await readFile(join(outer, '.git', 'config'), 'utf8');
	const previous = process.env.GIT_DIR;
	process.env.GIT_DIR = join(outer, '.git');
	try {
		await notesFixture();
	} finally {
		if (previous === undefined) delete process.env.GIT_DIR;
		else process.env.GIT_DIR = previous;
	}
	expect(await readFile(join(outer, '.git', 'config'), 'utf8')).toBe(outerConfig);
});

test(
	'release notes include conventional and unclassified commits',
	async () => {
		const { fixture, conventionalSha, proseSha } = await notesFixture();
		const result = await runNotes(fixture, ['--from', 'v1.0.0', '--to', 'HEAD']);
		// changelogen capitalizes conventional subjects.
		expect(result.stdout).toContain('Conventional subject');
		expect(result.stdout).toContain('Plain prose subject');
		expect(result.stdout).toContain(conventionalSha.slice(0, 7));
		expect(result.stdout).toContain(proseSha.slice(0, 7));
		expect(result.stderr).toContain('2 covered');
	},
	SPAWN_HEAVY_TIMEOUT_MS,
);

test(
	'invalid ranges fail without writing the output file',
	async () => {
		const { fixture } = await notesFixture();
		const out = join(fixture, 'notes.md');
		const result = await runNotes(
			fixture,
			['--from', 'missing', '--to', 'HEAD', '--out', out],
			{ reject: false },
		);
		expect(result.exitCode).toBe(1);
		await expect(access(out)).rejects.toThrow();
	},
	SPAWN_HEAVY_TIMEOUT_MS,
);

async function commitFile(fixture: string, file: string, subject: string): Promise<void> {
	await writeFile(join(fixture, file), `${subject}\n`);
	git(fixture, ['add', file]);
	git(fixture, ['commit', '-m', subject]);
}

async function changelogFixture(): Promise<string> {
	const fixture = await mkdtemp(join(tmpdir(), 'markless-changelog-'));
	git(fixture, ['init', '-b', 'main']);
	git(fixture, ['remote', 'add', 'origin', 'git@github.com:example/fixture.git']);
	await writeFile(join(fixture, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
	for (const [directory, manifest] of [
		['harbor', { name: '@example/harbor', version: '1.0.0' }],
		['tide', { name: '@example/tide', version: '1.0.0' }],
		['dock', { name: '@example/dock', version: '1.0.0', private: true }],
	] as const) {
		const packageDirectory = join(fixture, 'packages', directory);
		await mkdir(packageDirectory, { recursive: true });
		await writeFile(join(packageDirectory, 'package.json'), `${JSON.stringify(manifest)}\n`);
	}
	await writeFile(join(fixture, 'package.json'), '{"version":"1.0.0"}\n');
	git(fixture, ['add', '.']);
	git(fixture, ['commit', '-m', 'Initial commit']);
	git(fixture, ['tag', 'v1.0.0']);
	await commitFile(
		fixture,
		'a.txt',
		'feat(tide): tides can be read in the U019 morning - the reader now keeps state',
	);
	await commitFile(
		fixture,
		'b.txt',
		'fix(harbor,tide): a berth keeps its name after a reload (T107)',
	);
	await commitFile(fixture, 'c.txt', 'perf(harbor): open the harbor in one round trip');
	await commitFile(fixture, 'd.txt', 'fix(dock): a held package change stays out');
	await commitFile(fixture, 'e.txt', 'test(harbor): pin the berth name');
	await commitFile(fixture, 'f.txt', 'fix(website): docs page typo');
	await commitFile(fixture, 'g.txt', 'feat(harbor)!: berths are numbered from one');
	await commitFile(fixture, 'h.txt', 'fable-opus goal/U020 attempt 1 (partial)');
	await commitFile(fixture, 'i.txt', 'fix: plain unscoped fix for defect 84');
	return fixture;
}

test(
	'--changelog drafts a plain-language section grouped by released package',
	async () => {
		const fixture = await changelogFixture();
		const section = (await runNotes(fixture, ['--changelog', '--version', '1.1.0'])).stdout;
		expect(section.startsWith('## 1.1.0\n')).toBe(true);
		expect(section).toMatch(
			/### Breaking changes\n\n- \*\*@example\/harbor:\*\* Berths are numbered from one\.\n/u,
		);
		expect(section).toMatch(
			/### @example\/harbor\n\n(?:- .*\n)*- \*\*Fixed:\*\* A berth keeps its name after a reload\.\n/u,
		);
		expect(section).toContain('- **Faster:** Open the harbor in one round trip.');
		expect(section).toMatch(
			/### @example\/tide\n\n- \*\*New:\*\* Tides can be read in the morning\.\n/u,
		);
		expect(section).toMatch(/### General\n\n- \*\*Fixed:\*\* Plain unscoped fix\.\n/u);
		for (const internal of [
			'held package',
			'pin the berth',
			'docs page typo',
			'fable-opus',
			'U0',
			'T107',
			'defect',
		]) {
			expect(section).not.toContain(internal);
		}
		expect(section).toContain(
			'[All 9 commits since v1.0.0](https://github.com/example/fixture/compare/v1.0.0...v1.1.0)',
		);
	},
	SPAWN_HEAVY_TIMEOUT_MS,
);

test(
	'--changelog starts where --from says and names the last release with --since',
	async () => {
		const fixture = await changelogFixture();
		const cutFrom = git(fixture, ['rev-parse', 'HEAD~2']);
		const section = (
			await runNotes(fixture, [
				'--changelog',
				'--version',
				'1.1.0',
				'--from',
				cutFrom,
				'--since',
				'v1.0.0',
			])
		).stdout;
		expect(section).toContain('- **Fixed:** Plain unscoped fix.');
		expect(section).not.toContain('Open the harbor in one round trip');
		expect(section).toContain(
			`[All 2 commits since v1.0.0](https://github.com/example/fixture/compare/${cutFrom}...v1.1.0)`,
		);
	},
	SPAWN_HEAVY_TIMEOUT_MS,
);

test(
	'--changelog needs --version',
	async () => {
		const fixture = await changelogFixture();
		const result = await runNotes(fixture, ['--changelog'], { reject: false });
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain('--changelog needs --version');
	},
	SPAWN_HEAVY_TIMEOUT_MS,
);
