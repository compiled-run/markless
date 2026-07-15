import { createHash } from 'node:crypto';
import {
	lstat,
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rename,
	rm,
	rmdir,
	stat,
	symlink,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { afterEach, expect, test, vi } from 'vitest';

const detectAgenticEnvironment = vi.hoisted(() => vi.fn());
vi.mock('am-i-vibing', () => ({ detectAgenticEnvironment }));

import {
	addAgentSkills,
	detectDrivingAgent,
	parseAgentList,
	removeAgentSkills,
} from '../src/agents.ts';
import { CreateProgram, type ProgramRuntime } from '../src/index.ts';
import { createNodeRuntime } from '../src/node-runtime.ts';

const cleanupRoots: string[] = [];

afterEach(async () => {
	detectAgenticEnvironment.mockReset();
	await Promise.all(
		cleanupRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
	);
});

test('validates explicit canonical agent lists', () => {
	expect(parseAgentList('claude-code,codex,gemini-cli,github-copilot')).toEqual([
		'claude-code',
		'codex',
		'gemini-cli',
		'github-copilot',
	]);
	expect(parseAgentList('none')).toEqual([]);
	expect(() => parseAgentList('none,codex')).toThrow("'none' cannot be combined");
	expect(() => parseAgentList('codex,codex')).toThrow("duplicate agent 'codex'");
	expect(() => parseAgentList('cursor')).toThrow(
		'Unavailable — Cursor has no documented conditional personal skill; User Rules apply to every project.',
	);
	expect(() => parseAgentList('windsurf')).toThrow("Unsupported agent 'windsurf'");
});

test('uses the exact environment-only tier-one detection call', async () => {
	const root = await workspace();
	detectAgenticEnvironment.mockReturnValue({ id: 'codex', name: 'OpenAI Codex' });
	const testRuntime = runtime(root, { env: { CODEX_THREAD_ID: 'test' } });

	expect(detectDrivingAgent(testRuntime)).toBe('codex');
	expect(detectAgenticEnvironment).toHaveBeenCalledWith({
		env: testRuntime.env,
		checkProcesses: false,
	});
	expect(detectAgenticEnvironment.mock.calls[0]?.[0]).not.toHaveProperty('processAncestry');
});

test('preselects found writable agents, shows exact skill paths, and disables Cursor', async () => {
	const root = await workspace();
	const home = join(root, 'home');
	await Promise.all([
		mkdir(join(home, '.claude'), { recursive: true }),
		mkdir(join(home, '.cursor'), { recursive: true }),
	]);
	const notes: string[] = [];
	let selected = false;
	const program = new CreateProgram();
	const testRuntime = runtime(root, {
		homeDir: home,
		isTTY: true,
		prompts: {
			intro() {},
			note(message, title) {
				notes.push(`${title}:${message}`);
			},
			async select({ message }) {
				if (message === 'Ready to create?') return 'create';
				throw new Error(`Unexpected prompt: ${message}`);
			},
			async multiselect(options) {
				selected = true;
				expect(options.initialValues).toEqual(['claude-code']);
				expect(
					options.options.find((option) => option.value === 'claude-code')?.hint,
				).toContain('~/.claude/skills/markless/SKILL.md');
				const cursor = options.options.find((option) => option.value === 'cursor');
				expect(cursor).toMatchObject({ disabled: true });
				expect(cursor?.hint).toContain('User Rules apply to every project.');
				return ['claude-code'];
			},
			async text() {
				throw new Error('Project name is already supplied.');
			},
			outro() {},
			cancel() {},
		},
	});
	const input = program.validate(
		['app', '--starter', 'minimal', '--format', 'node', '--no-install', '--no-git'],
		testRuntime,
	);
	const options = await program.interact(input, testRuntime);

	expect(selected).toBe(true);
	expect(options.agents).toEqual(['claude-code']);
	expect(notes.some((note) => note.includes('Found on this machine: Claude Code, Cursor'))).toBe(
		true,
	);
	await expect(stat(join(home, '.claude/skills/markless/SKILL.md'))).rejects.toThrow();
});

test('handles every non-interactive consent branch without using installed directories as consent', async () => {
	const root = await workspace();
	const home = join(root, 'home');
	await mkdir(join(home, '.claude'), { recursive: true });

	detectAgenticEnvironment.mockReturnValue({ id: null, name: null });
	await new CreateProgram().run(
		['plain', '--yes', '--no-install', '--no-git'],
		runtime(root, { homeDir: home }),
	);
	await expect(stat(join(home, '.claude/skills/markless/SKILL.md'))).rejects.toThrow();

	await new CreateProgram().run(
		['explicit', '--yes', '--no-install', '--no-git', '--agents', 'claude-code,gemini-cli'],
		runtime(root, { homeDir: home }),
	);
	await expect(
		readFile(join(home, '.claude/skills/markless/SKILL.md'), 'utf-8'),
	).resolves.toContain('name: markless');
	await expect(
		readFile(join(home, '.gemini/skills/markless/SKILL.md'), 'utf-8'),
	).resolves.toContain('@markless/core');

	const noneHome = join(root, 'none-home');
	detectAgenticEnvironment.mockReturnValue({ id: 'codex', name: 'OpenAI Codex' });
	await new CreateProgram().run(
		['none', '--yes', '--no-install', '--no-git', '--agents', 'none'],
		runtime(root, { homeDir: noneHome }),
	);
	await expect(stat(join(noneHome, '.codex'))).rejects.toThrow();

	const drivenHome = join(root, 'driven-home');
	const stdout: string[] = [];
	await new CreateProgram().run(
		['driven', '--yes', '--no-install', '--no-git'],
		runtime(root, { homeDir: drivenHome, stdout }),
	);
	await expect(
		readFile(join(drivenHome, '.codex/skills/markless/SKILL.md'), 'utf-8'),
	).resolves.toContain('agent/markless.md');
	expect(stdout.join('')).toContain('Detected Codex running this setup');
	expect(stdout.join('')).toContain('~/.codex/skills/markless/SKILL.md');

	const cursorHome = join(root, 'cursor-home');
	detectAgenticEnvironment.mockReturnValue({ id: 'cursor-agent', name: 'Cursor Agent' });
	await new CreateProgram().run(
		['cursor', '--yes', '--no-install', '--no-git'],
		runtime(root, { homeDir: cursorHome }),
	);
	await expect(stat(cursorHome)).rejects.toThrow();
});

test('writes atomically, updates valid managed content, and never overwrites collisions', async () => {
	const root = await workspace();
	const atomicCreates: string[] = [];
	const atomicWrites: string[] = [];
	const testRuntime = runtime(root, {
		homeDir: join(root, 'home'),
		atomicCreates,
		atomicWrites,
	});
	const [created] = await addAgentSkills(['codex'], testRuntime);
	expect(created?.status).toBe('added');
	expect(atomicCreates).toEqual([join(root, 'home/.codex/skills/markless/SKILL.md')]);
	expect(atomicWrites).toEqual([]);

	const [rerun] = await addAgentSkills(['codex'], testRuntime);
	expect(rerun?.status).toBe('already-configured');
	expect(atomicWrites).toHaveLength(0);

	const oldPayload = 'old managed payload\n';
	const oldHash = createHash('sha256').update(oldPayload).digest('hex');
	await writeFile(
		join(root, 'home/.codex/skills/markless/SKILL.md'),
		`<!-- markless-managed-skill sha256:${oldHash} -->\n${oldPayload}`,
	);
	const [updated] = await addAgentSkills(['codex'], testRuntime);
	expect(updated?.status).toBe('updated');
	expect(atomicWrites).toHaveLength(1);

	const claudePath = join(root, 'home/.claude/skills/markless/SKILL.md');
	await mkdir(join(root, 'home/.claude/skills/markless'), { recursive: true });
	await writeFile(claudePath, 'user-authored');
	const [foreign] = await addAgentSkills(['claude-code'], testRuntime);
	expect(foreign?.status).toBe('collision');
	await expect(readFile(claudePath, 'utf-8')).resolves.toBe('user-authored');

	const managed = await readFile(join(root, 'home/.codex/skills/markless/SKILL.md'), 'utf-8');
	await writeFile(join(root, 'home/.codex/skills/markless/SKILL.md'), `${managed}modified`);
	const [modified] = await addAgentSkills(['codex'], testRuntime);
	expect(modified?.status).toBe('collision');
});

test('revalidates a target that appears during create-if-absent', async () => {
	const root = await workspace();
	const foreignHome = join(root, 'foreign-home');
	const foreignPath = join(foreignHome, '.codex/skills/markless/SKILL.md');
	const foreignRuntime = runtime(root, {
		homeDir: foreignHome,
		async atomicCreate(path) {
			await writeFile(path, 'concurrent user content');
			return false;
		},
	});

	expect((await addAgentSkills(['codex'], foreignRuntime))[0]?.status).toBe('collision');
	await expect(readFile(foreignPath, 'utf-8')).resolves.toBe('concurrent user content');

	const managedHome = join(root, 'managed-home');
	const managedPath = join(managedHome, '.codex/skills/markless/SKILL.md');
	const oldPayload = 'concurrent managed payload\n';
	const oldHash = createHash('sha256').update(oldPayload).digest('hex');
	const managedRuntime = runtime(root, {
		homeDir: managedHome,
		async atomicCreate(path) {
			await writeFile(
				path,
				`<!-- markless-managed-skill sha256:${oldHash} -->\n${oldPayload}`,
			);
			return false;
		},
	});

	expect((await addAgentSkills(['codex'], managedRuntime))[0]?.status).toBe('updated');
	await expect(readFile(managedPath, 'utf-8')).resolves.toContain('name: markless');
});

test('uses only the four exact personal-skill targets and never global instruction files', async () => {
	const root = await workspace();
	const home = join(root, 'home');
	const results = await addAgentSkills(
		['claude-code', 'codex', 'gemini-cli', 'github-copilot'],
		runtime(root, { homeDir: home }),
	);
	expect(results.map((result) => result.path)).toEqual([
		join(home, '.claude/skills/markless/SKILL.md'),
		join(home, '.codex/skills/markless/SKILL.md'),
		join(home, '.gemini/skills/markless/SKILL.md'),
		join(home, '.copilot/skills/markless/SKILL.md'),
	]);
	await expect(
		readFile(join(home, '.claude/skills/markless/SKILL.md'), 'utf-8'),
	).resolves.toMatch(/^---\nname: markless\n/);
	for (const path of [
		join(home, '.claude/CLAUDE.md'),
		join(home, '.codex/AGENTS.md'),
		join(home, '.gemini/GEMINI.md'),
		join(home, '.copilot/copilot-instructions.md'),
		join(home, '.cursor/skills/markless/SKILL.md'),
	]) {
		await expect(stat(path)).rejects.toThrow();
	}
});

test('agents add and remove subcommands share the managed writer and safe remover', async () => {
	const root = await workspace();
	const home = join(root, 'home');
	const testRuntime = runtime(root, { homeDir: home });
	const skillPath = join(home, '.codex/skills/markless/SKILL.md');

	await new CreateProgram().run(['agents', 'add', '--agents', 'codex'], testRuntime);
	await expect(readFile(skillPath, 'utf-8')).resolves.toContain('name: markless');
	await new CreateProgram().run(['agents', 'remove'], testRuntime);
	await expect(stat(skillPath)).rejects.toThrow();
	await expect(stat(join(home, '.codex/skills'))).resolves.toBeTruthy();
});

test('removes only verified managed files and only their empty markless directory', async () => {
	const root = await workspace();
	const home = join(root, 'home');
	const testRuntime = runtime(root, { homeDir: home });
	await addAgentSkills(['codex', 'gemini-cli'], testRuntime);
	await writeFile(join(home, '.codex/skills/markless/notes.md'), 'keep');
	const geminiPath = join(home, '.gemini/skills/markless/SKILL.md');
	await writeFile(geminiPath, `${await readFile(geminiPath, 'utf-8')}changed`);

	const results = await removeAgentSkills(['codex', 'gemini-cli'], testRuntime);
	expect(results.map((result) => result.status)).toEqual(['removed', 'collision']);
	await expect(readFile(join(home, '.codex/skills/markless/notes.md'), 'utf-8')).resolves.toBe(
		'keep',
	);
	await expect(readFile(geminiPath, 'utf-8')).resolves.toContain('changed');
	await expect(stat(join(home, '.codex/skills'))).resolves.toBeTruthy();
	await expect(stat(join(home, '.gemini'))).resolves.toBeTruthy();
});

test('the Node runtime treats skill symlinks and dangling symlinks as collisions', async () => {
	const root = await workspace();
	const home = join(root, 'home');
	const target = join(root, 'user-skill.md');
	const claudePath = join(home, '.claude/skills/markless/SKILL.md');
	const codexPath = join(home, '.codex/skills/markless/SKILL.md');
	await Promise.all([
		mkdir(join(home, '.claude/skills/markless'), { recursive: true }),
		mkdir(join(home, '.codex/skills/markless'), { recursive: true }),
		writeFile(target, 'user-authored'),
	]);
	await symlink(target, claudePath);
	await symlink(join(root, 'missing.md'), codexPath);
	const testRuntime = createNodeRuntime({ homeDir: home, isTTY: false });

	expect((await addAgentSkills(['claude-code'], testRuntime))[0]?.status).toBe('collision');
	expect((await removeAgentSkills(['claude-code'], testRuntime))[0]?.status).toBe('collision');
	expect((await addAgentSkills(['codex'], testRuntime))[0]?.status).toBe('collision');
	expect((await removeAgentSkills(['codex'], testRuntime))[0]?.status).toBe('collision');
	expect((await lstat(claudePath)).isSymbolicLink()).toBe(true);
	expect((await lstat(codexPath)).isSymbolicLink()).toBe(true);
	await expect(readFile(target, 'utf-8')).resolves.toBe('user-authored');
});

test('the Node runtime removes a managed file but preserves its directory and foreign entry', async () => {
	const root = await workspace();
	const home = join(root, 'home');
	const testRuntime = createNodeRuntime({ homeDir: home, isTTY: false });
	const directory = join(home, '.codex/skills/markless');
	await addAgentSkills(['codex'], testRuntime);
	await symlink(join(root, 'elsewhere'), join(directory, 'user-link'));

	expect((await removeAgentSkills(['codex'], testRuntime))[0]?.status).toBe('removed');
	await expect(lstat(join(directory, 'SKILL.md'))).rejects.toMatchObject({ code: 'ENOENT' });
	expect((await lstat(join(directory, 'user-link'))).isSymbolicLink()).toBe(true);
});

test('the Node runtime treats a non-regular skill entry as a collision', async () => {
	const root = await workspace();
	const home = join(root, 'home');
	const skillPath = join(home, '.gemini/skills/markless/SKILL.md');
	await mkdir(skillPath, { recursive: true });
	const testRuntime = createNodeRuntime({ homeDir: home, isTTY: false });

	expect((await addAgentSkills(['gemini-cli'], testRuntime))[0]?.status).toBe('collision');
	expect((await removeAgentSkills(['gemini-cli'], testRuntime))[0]?.status).toBe('collision');
	expect((await lstat(skillPath)).isDirectory()).toBe(true);
});

test('agents add reports every Node-runtime result when one agent collides', async () => {
	const root = await workspace();
	const home = join(root, 'home');
	const claudePath = join(home, '.claude/skills/markless/SKILL.md');
	await mkdir(join(home, '.claude/skills/markless'), { recursive: true });
	await symlink(join(root, 'missing.md'), claudePath);
	const stdout: string[] = [];
	const stderr: string[] = [];
	const testRuntime = createNodeRuntime({
		homeDir: home,
		isTTY: false,
		stdout: { write: (chunk) => stdout.push(String(chunk)) },
		stderr: { write: (chunk) => stderr.push(String(chunk)) },
	});

	await expect(
		new CreateProgram().run(
			['agents', 'add', '--agents', 'claude-code,codex'],
			testRuntime,
		),
	).rejects.toThrow('one or more collisions');
	expect(stderr.join('')).toContain(`Agent configuration collision at ${claudePath}`);
	expect(stdout.join('')).toContain(
		`Added Markless to Codex: ${join(home, '.codex/skills/markless/SKILL.md')}`,
	);
});

async function workspace(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'markless-agent-test-'));
	cleanupRoots.push(root);
	return root;
}

function runtime(
	cwd: string,
	overrides: {
		readonly env?: Record<string, string | undefined>;
		readonly homeDir?: string;
		readonly isTTY?: boolean;
		readonly prompts?: ProgramRuntime['prompts'];
		readonly atomicCreate?: (path: string | URL, contents: string) => Promise<boolean>;
		readonly atomicCreates?: string[];
		readonly atomicWrites?: string[];
		readonly stdout?: string[];
	} = {},
): ProgramRuntime {
	return {
		cwd: () => cwd,
		env: overrides.env ?? {},
		homeDir: overrides.homeDir ?? join(cwd, 'fake-home'),
		fs: {
			async atomicCreateFile(path, contents) {
				overrides.atomicCreates?.push(String(path));
				if (overrides.atomicCreate) return overrides.atomicCreate(path, contents);
				try {
					await writeFile(path, contents, { flag: 'wx' });
					return true;
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
					throw error;
				}
			},
			async atomicWriteFile(path, contents) {
				overrides.atomicWrites?.push(String(path));
				const temporaryPath = `${String(path)}.test-tmp`;
				await writeFile(temporaryPath, contents);
				await rename(temporaryPath, path);
			},
			async lstat(path) {
				try {
					return await lstat(path);
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
					throw error;
				}
			},
			mkdir,
			async readDirectory(path) {
				const entries = await readdir(path, { withFileTypes: true });
				return entries.map((entry) => ({
					name: entry.name,
					kind: entry.isDirectory()
						? ('directory' as const)
						: entry.isFile()
							? ('file' as const)
							: entry.isSymbolicLink()
								? ('symlink' as const)
								: ('other' as const),
				}));
			},
			readFile(path) {
				return readFile(path, 'utf-8');
			},
			async stat(path) {
				return stat(path).catch(() => null);
			},
			async remove(path, options) {
				await rm(path, options);
			},
			async rmdir(path) {
				try {
					await rmdir(path);
				} catch (error) {
					const code = (error as NodeJS.ErrnoException).code;
					if (code !== 'ENOTEMPTY' && code !== 'EEXIST') throw error;
				}
			},
			writeFile,
		},
		isTTY: overrides.isTTY ?? false,
		prompts: overrides.prompts,
		stdout: { write: (chunk) => overrides.stdout?.push(String(chunk)) },
		stderr: { write: () => true },
		spawn: () => ({ status: 0 }),
		async sha256(contents) {
			return createHash('sha256').update(contents).digest('hex');
		},
	};
}
