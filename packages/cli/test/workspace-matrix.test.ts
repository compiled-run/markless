import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	chmod,
	lstat,
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rename,
	rm,
	rmdir,
	stat,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'pathe';
import { afterEach, describe, expect, test } from 'vitest';
import {
	CreateProgram,
	installDependencies,
	type PackageManager,
	type ProgramRuntime,
	type ProjectFormat,
} from '../src/index.ts';

// Real package-manager binaries, real installs, real host workspaces. Opt-in
// because it needs npm, pnpm, bun, deno and corepack on PATH and a network (or
// warm caches) to fetch one tiny dependency per lane.
const enabled = process.env.MARKLESS_PM_MATRIX === '1';

// The Tier 3 smoke lane below installs the real shipped template instead of the
// slim manifest. It is separately gated because it downloads the whole starter
// dependency set (@markless/*, nitro, vite-plus, vite, typescript) from the
// registry, which is a different cost and failure class from the Tier 2 lanes.
const fullEnabled = process.env.MARKLESS_PM_MATRIX_FULL === '1';

// The one deliberate reduction in the Tier 2 lanes: the shipped template's
// manifest is replaced with a single tiny dependency. Walk-up behavior is a
// function of the enclosing tree and the install cwd, not of the dependency
// list, and installing the real template turns a two-second lane into a
// minutes-long one. The Tier 3 lane exists to show the substitution is not
// hiding anything: it runs the same code path with the manifest left alone.
const DEPENDENCY = 'is-number';
const DEPENDENCY_VERSION = '7.0.0';

const TEST_TIMEOUT = 90_000;
// The full-template install is registry-bound and cold on a fresh runner.
const FULL_TEST_TIMEOUT = 600_000;

interface MatrixLane {
	readonly name: string;
	readonly manager: PackageManager;
	readonly format: ProjectFormat;
	readonly userAgent: string;
	/** The exact arguments the CLI should hand the manager when standalone. */
	readonly standaloneArgs: readonly string[];
	/** Files at the host root that must not appear after a standalone install. */
	readonly hostStandaloneForbidden: readonly string[];
	/** What the app gains from a standalone install. */
	readonly appArtifact: string;
	/** What the host legitimately gains from an already-a-member install. */
	readonly hostMemberArtifact: string;
	/** Provisioned through corepack, because yarn is not on PATH. */
	readonly yarnVersion?: string;
}

const LANES: readonly MatrixLane[] = [
	{
		appArtifact: `node_modules/${DEPENDENCY}/package.json`,
		format: 'node',
		hostMemberArtifact: 'node_modules',
		hostStandaloneForbidden: ['node_modules', 'package-lock.json'],
		manager: 'npm',
		name: 'npm',
		standaloneArgs: ['install', '--workspaces=false'],
		userAgent: 'npm/12.0.1 node/v24.15.0',
	},
	{
		appArtifact: `node_modules/${DEPENDENCY}/package.json`,
		format: 'node',
		hostMemberArtifact: 'node_modules',
		hostStandaloneForbidden: ['node_modules', 'pnpm-lock.yaml'],
		manager: 'pnpm',
		name: 'pnpm',
		standaloneArgs: ['install', '--ignore-workspace'],
		userAgent: 'pnpm/10.33.2 npm/? node/v24.15.0',
	},
	{
		appArtifact: `node_modules/${DEPENDENCY}/package.json`,
		format: 'node',
		hostMemberArtifact: 'node_modules',
		hostStandaloneForbidden: ['node_modules', 'yarn.lock'],
		manager: 'yarn',
		name: 'yarn classic',
		standaloneArgs: ['install'],
		userAgent: 'yarn/1.22.22 npm/? node/v24.15.0',
		yarnVersion: '1.22.22',
	},
	{
		// Berry 4 links through Plug'n'Play, so the app's dependency lives in
		// .pnp.cjs and .yarn rather than in a node_modules tree.
		appArtifact: '.pnp.cjs',
		format: 'node',
		hostMemberArtifact: '.pnp.cjs',
		hostStandaloneForbidden: ['node_modules', '.pnp.cjs'],
		manager: 'yarn',
		name: 'yarn berry',
		standaloneArgs: ['install'],
		userAgent: 'yarn/4.17.1 npm/? node/v24.15.0',
		yarnVersion: '4.17.1',
	},
	{
		appArtifact: `node_modules/${DEPENDENCY}/package.json`,
		format: 'node',
		hostMemberArtifact: 'node_modules',
		hostStandaloneForbidden: ['node_modules', 'bun.lock', 'bun.lockb'],
		manager: 'bun',
		name: 'bun',
		standaloneArgs: ['install'],
		userAgent: 'bun/1.3.14 npm/? node/v24.15.0',
	},
	{
		appArtifact: `node_modules/${DEPENDENCY}/package.json`,
		format: 'deno',
		hostMemberArtifact: 'deno.lock',
		hostStandaloneForbidden: ['node_modules', 'deno.lock'],
		manager: 'deno',
		name: 'deno',
		standaloneArgs: ['install'],
		userAgent: 'deno/2.8.3 npm/? deno/2.8.3',
	},
];

const cleanupRoots: string[] = [];

afterEach(async () => {
	await Promise.all(
		cleanupRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
	);
});

const makeTempDir = async (prefix: string) => {
	const root = await mkdtemp(join(tmpdir(), prefix));
	cleanupRoots.push(root);
	return root;
};

const exists = async (path: string) =>
	stat(path)
		.then(() => true)
		.catch(() => false);

const sha256File = async (path: string) =>
	createHash('sha256')
		.update(await readFile(path))
		.digest('hex');

const writeFiles = async (root: string, files: Record<string, string>) => {
	for (const [path, contents] of Object.entries(files)) {
		const full = join(root, path);
		await mkdir(dirname(full), { recursive: true });
		await writeFile(full, contents);
	}
};

const asJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/**
 * The T002 fixture shape: a host workspace root declaring `packages/*` plus one
 * real member. `memberPaths` adds further declared members, which is how the
 * already-a-member variant puts the new app inside the declaration and how the
 * frameless repro gets a second host project.
 */
const writeHostWorkspace = async (
	root: string,
	lane: MatrixLane,
	options: { readonly memberPath?: string; readonly extraProjects?: readonly string[] } = {},
) => {
	const extraProjects = options.extraProjects ?? [];

	if (lane.manager === 'deno') {
		await writeFiles(root, {
			'deno.json': asJson({
				workspace: [
					'./packages/member',
					...extraProjects.map((path) => `./${path}`),
					...(options.memberPath ? [`./${options.memberPath}`] : []),
				],
			}),
			'packages/member/deno.json': asJson({
				exports: './mod.ts',
				name: '@host/member',
				version: '1.0.0',
			}),
			'packages/member/mod.ts': 'export const member = 1;\n',
		});
		for (const path of extraProjects) {
			await writeFiles(root, {
				[`${path}/deno.json`]: asJson({
					exports: './mod.ts',
					name: `@host/${path.replaceAll('/', '-')}`,
					version: '1.0.0',
				}),
				[`${path}/mod.ts`]: 'export const project = 1;\n',
			});
		}
		return;
	}

	const projectManifests = Object.fromEntries(
		['packages/member', ...extraProjects].map((path) => [
			`${path}/package.json`,
			asJson({ name: path.replaceAll('/', '-'), version: '1.0.0' }),
		]),
	);

	if (lane.manager === 'pnpm') {
		await writeFiles(root, {
			...projectManifests,
			'package.json': asJson({ name: 'host', private: true, version: '1.0.0' }),
			'pnpm-workspace.yaml': `packages:\n  - 'packages/*'\n${
				options.memberPath ? `  - '${options.memberPath}'\n` : ''
			}`,
		});
		return;
	}

	await writeFiles(root, {
		...projectManifests,
		'package.json': asJson({
			name: 'host',
			private: true,
			workspaces: ['packages/*', ...(options.memberPath ? [options.memberPath] : [])],
		}),
	});

	// Berry's project root is the nearest ancestor holding a yarn.lock.
	if (lane.yarnVersion?.startsWith('4')) await writeFiles(root, { 'yarn.lock': '' });
};

/**
 * yarn is not on PATH; corepack provisions it. A shim on PATH keeps the command
 * the CLI spawns ("yarn") exactly what it would be in the field, so this test
 * never rewrites the arguments under test.
 */
const makeYarnShim = async (version: string) => {
	const binDir = await makeTempDir('markless-pm-bin-');
	const shim = join(binDir, 'yarn');
	await writeFile(shim, `#!/bin/sh\nexec corepack yarn@${version} "$@"\n`);
	await chmod(shim, 0o755);
	return binDir;
};

interface RecordedCommand {
	readonly command: string;
	readonly args: string[];
	readonly cwd: string;
	readonly status: number | null;
	readonly output: string;
}

const matrixRuntime = (options: {
	readonly cwd: string;
	readonly homeDir: string;
	readonly userAgent: string;
	readonly binDir?: string;
	readonly commands: RecordedCommand[];
	readonly stdoutWrites: string[];
}): ProgramRuntime => ({
	cwd: () => options.cwd,
	env: { npm_config_user_agent: options.userAgent },
	fs: {
		async atomicCreateFile(path, contents) {
			try {
				await writeFile(path, contents, { flag: 'wx' });
				return true;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
				throw error;
			}
		},
		async atomicWriteFile(path, contents) {
			const temporaryPath = `${String(path)}.test-tmp`;
			await writeFile(temporaryPath, contents);
			await rename(temporaryPath, path);
		},
		async lstat(path) {
			return await lstat(path).catch(() => null);
		},
		async mkdir(path, mkdirOptions) {
			await mkdir(path, mkdirOptions);
		},
		async readDirectory(path) {
			const entries = await readdir(path, { withFileTypes: true });
			return entries.map((entry) => ({
				kind: entry.isDirectory()
					? ('directory' as const)
					: entry.isFile()
						? ('file' as const)
						: entry.isSymbolicLink()
							? ('symlink' as const)
							: ('other' as const),
				name: entry.name,
			}));
		},
		readFile(path) {
			return readFile(path, 'utf-8');
		},
		async stat(path) {
			return await stat(path).catch(() => null);
		},
		async remove(path, removeOptions) {
			await rm(path, removeOptions);
		},
		async rmdir(path) {
			await rmdir(path).catch(() => undefined);
		},
		async writeFile(path, contents) {
			await writeFile(path, contents);
		},
	},
	homeDir: options.homeDir,
	isTTY: false,
	stdout: {
		write: (chunk) => {
			options.stdoutWrites.push(String(chunk));
			return true;
		},
	},
	spawn: (command, args, spawnOptions) => {
		const result = spawnSync(command, [...args], {
			cwd: spawnOptions.cwd,
			encoding: 'utf-8',
			env: {
				...process.env,
				COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
				PATH: [options.binDir, process.env.PATH].filter(Boolean).join(':'),
				// A fresh app has no lockfile to be immutable about, and CI sets
				// berry's immutable mode on by default.
				YARN_ENABLE_IMMUTABLE_INSTALLS: 'false',
			},
		});
		options.commands.push({
			args: [...args],
			command,
			cwd: spawnOptions.cwd,
			output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
			status: result.status,
		});
		return { status: result.status };
	},
	async sha256(contents) {
		return createHash('sha256').update(contents).digest('hex');
	},
});

/**
 * Scaffolds with the real CLI, swaps the shipped manifest for one tiny
 * dependency (unless the caller keeps the real one), then runs the install
 * through the very function `execute` calls. The arguments are never rebuilt
 * here: a test that derives its own argv proves nothing about what the CLI does.
 */
const scaffoldAndInstall = async (
	root: string,
	lane: MatrixLane,
	appPath: string,
	scaffoldOptions: {
		readonly extraArgs?: readonly string[];
		/** 'slim' swaps in one tiny dependency; 'template' installs what ships. */
		readonly manifest?: 'slim' | 'template';
	} = {},
) => {
	const extraArgs = scaffoldOptions.extraArgs ?? [];
	const commands: RecordedCommand[] = [];
	const stdoutWrites: string[] = [];
	const binDir = lane.yarnVersion ? await makeYarnShim(lane.yarnVersion) : undefined;
	const runtime = matrixRuntime({
		binDir,
		commands,
		cwd: root,
		homeDir: await makeTempDir('markless-pm-home-'),
		stdoutWrites,
		userAgent: lane.userAgent,
	});

	const program = new CreateProgram();
	const input = program.validate(
		[
			appPath,
			'--yes',
			'--agents',
			'none',
			'--no-install',
			'--no-git',
			'--format',
			lane.format,
			...extraArgs,
		],
		runtime,
	);
	const options = await program.interact(input, runtime);
	await program.execute(options, runtime);

	const appDir = join(root, appPath);
	if (scaffoldOptions.manifest !== 'template') await slimManifest(appDir, lane);
	await installDependencies(options, appDir, runtime);

	const install = commands.at(-1);
	expect(install, `${lane.name}: no install command ran`).toBeDefined();
	expect(install!.status, `${lane.name} install failed:\n${install!.output}`).toBe(0);

	return { appDir, binDir, commands, install: install!, options, stdoutWrites };
};

const slimManifest = async (appDir: string, lane: MatrixLane) => {
	if (lane.format === 'deno') {
		const manifest = JSON.parse(await readFile(join(appDir, 'deno.json'), 'utf-8')) as Record<
			string,
			unknown
		>;
		await writeFile(
			join(appDir, 'deno.json'),
			asJson({
				...manifest,
				imports: { [DEPENDENCY]: `npm:${DEPENDENCY}@${DEPENDENCY_VERSION}` },
			}),
		);
		return;
	}

	const manifest = JSON.parse(await readFile(join(appDir, 'package.json'), 'utf-8')) as {
		name: string;
	};
	await writeFile(
		join(appDir, 'package.json'),
		asJson({
			dependencies: { [DEPENDENCY]: DEPENDENCY_VERSION },
			name: manifest.name,
			private: true,
			version: '0.0.0',
		}),
	);
};

const hostConfigPath = (root: string, lane: MatrixLane) => {
	if (lane.manager === 'deno') return join(root, 'deno.json');
	if (lane.manager === 'pnpm') return join(root, 'pnpm-workspace.yaml');
	return join(root, 'package.json');
};

/**
 * Asks the manager itself whether the app can reach its dependency from the app
 * directory, rather than guessing from a path: berry links through Plug'n'Play
 * and deno through its own module graph, so neither has a node_modules entry to
 * look for.
 */
const resolveFromApp = (lane: MatrixLane, appDir: string, binDir?: string) => {
	const env = {
		...process.env,
		COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
		PATH: [binDir, process.env.PATH].filter(Boolean).join(':'),
	};

	if (lane.manager === 'deno') {
		return spawnSync('deno', ['eval', `import ${JSON.stringify(DEPENDENCY)};`], {
			cwd: appDir,
			encoding: 'utf-8',
			env,
		});
	}
	if (lane.yarnVersion?.startsWith('4')) {
		return spawnSync('yarn', ['node', '-e', `require.resolve('${DEPENDENCY}')`], {
			cwd: appDir,
			encoding: 'utf-8',
			env,
		});
	}
	return spawnSync('node', ['-e', `require.resolve('${DEPENDENCY}')`], {
		cwd: appDir,
		encoding: 'utf-8',
		env,
	});
};

/**
 * The exact text the host config should hold after the join: the fixture's own
 * text with one entry inserted. Built here by string surgery so the assertion
 * never borrows the writer it is checking.
 */
const joinedConfig = (before: string, lane: MatrixLane) => {
	if (lane.manager === 'pnpm') return `${before}  - 'nested/newapp'\n`;
	if (lane.manager === 'deno') {
		return before.replace(
			'    "./packages/member"\n',
			'    "./packages/member",\n    "./nested/newapp"\n',
		);
	}
	return before.replace('    "packages/*"\n', '    "packages/*",\n    "nested/newapp"\n');
};

describe.skipIf(!enabled)('package manager workspace matrix', () => {
	for (const lane of LANES) {
		test(
			`${lane.name}: a non-member app installs on its own and leaves the host alone`,
			async () => {
				const root = await makeTempDir('markless-pm-standalone-');
				await writeHostWorkspace(root, lane);
				const configPath = hostConfigPath(root, lane);
				const configBefore = await sha256File(configPath);

				const { appDir, binDir, install, stdoutWrites } = await scaffoldAndInstall(
					root,
					lane,
					'nested/newapp',
				);

				expect(install.command).toBe(lane.manager);
				expect(install.args).toEqual([...lane.standaloneArgs]);
				expect(install.cwd).toBe(appDir);

				// The enclosing workspace config is byte-identical.
				await expect(sha256File(configPath)).resolves.toBe(configBefore);
				for (const entry of lane.hostStandaloneForbidden) {
					await expect(
						exists(join(root, entry)),
						`${lane.name} host/${entry}`,
					).resolves.toBe(false);
				}
				// Berry's fixture starts with an empty root lockfile; it must stay empty.
				if (lane.yarnVersion?.startsWith('4')) {
					await expect(readFile(join(root, 'yarn.lock'), 'utf-8')).resolves.toBe('');
				}

				// The app's dependency resolves from the app directory.
				await expect(exists(join(appDir, lane.appArtifact))).resolves.toBe(true);
				if (lane.yarnVersion?.startsWith('4')) {
					const resolved = resolveFromApp(lane, appDir, binDir);
					expect(resolved.status, resolved.stderr).toBe(0);
				}

				// The non-interactive run says why it kept the app separate.
				expect(stdoutWrites.join('')).toContain(
					`Found a ${lane.manager} workspace at ${root}`,
				);
			},
			TEST_TIMEOUT,
		);

		test(
			`${lane.name}: an app that already matches a member declaration is left alone`,
			async () => {
				const root = await makeTempDir('markless-pm-member-');
				await writeHostWorkspace(root, lane, { memberPath: 'packages/newapp' });

				const { commands, install, options, stdoutWrites } = await scaffoldAndInstall(
					root,
					lane,
					'packages/newapp',
				);

				expect(options.enclosingWorkspace?.isMember).toBe(true);
				// No added flag, no prepared file, nothing said.
				expect(install.args).toEqual(['install']);
				expect(commands).toHaveLength(1);
				expect(stdoutWrites.join('')).not.toContain('Found a');
				await expect(exists(join(root, 'packages/newapp/yarn.lock'))).resolves.toBe(false);

				// Walking up and writing at the host root is correct here, and is
				// asserted as expected rather than prevented.
				await expect(
					exists(join(root, lane.hostMemberArtifact)),
					`${lane.name} host/${lane.hostMemberArtifact}`,
				).resolves.toBe(true);
			},
			TEST_TIMEOUT,
		);

		test(
			`${lane.name}: joining adds one entry, installs at the root, and the app resolves through the workspace`,
			async () => {
				const root = await makeTempDir('markless-pm-join-');
				await writeHostWorkspace(root, lane);
				const configPath = hostConfigPath(root, lane);
				const configBefore = await readFile(configPath, 'utf-8');

				const { appDir, binDir, install, stdoutWrites } = await scaffoldAndInstall(
					root,
					lane,
					'nested/newapp',
					{ extraArgs: ['--workspace'] },
				);

				// Exactly one member entry added, every other byte untouched.
				await expect(readFile(configPath, 'utf-8'), `${lane.name} config`).resolves.toBe(
					joinedConfig(configBefore, lane),
				);
				expect(stdoutWrites.join('')).toContain(
					`Added "nested/newapp" to ${basename(configPath)} and installing at ${root}`,
				);
				expect(stdoutWrites.join('')).not.toContain('is not one of its members');

				// The install runs at the workspace root, with no standalone flag.
				expect(install.command).toBe(lane.manager);
				expect(install.args).toEqual(['install']);
				expect(install.cwd).toBe(root);
				await expect(exists(join(appDir, 'yarn.lock'))).resolves.toBe(false);

				// And the app can reach its dependency through that workspace.
				const resolved = resolveFromApp(lane, appDir, binDir);
				expect(
					resolved.status,
					`${lane.name} resolve:\n${resolved.stdout ?? ''}${resolved.stderr ?? ''}`,
				).toBe(0);
			},
			TEST_TIMEOUT,
		);
	}

	test(
		'the frameless repro no longer reinstalls the host workspace',
		async () => {
			const lane = LANES.find((entry) => entry.manager === 'pnpm')!;
			const root = await makeTempDir('markless-pm-frameless-');
			await writeHostWorkspace(root, lane, { extraProjects: ['packages/second'] });

			const { appDir, install, stdoutWrites } = await scaffoldAndInstall(
				root,
				lane,
				'nested/newapp',
			);

			// The reported failure printed "Scope: all 2 workspace projects" and
			// installed the host instead of the app.
			expect(install.output).not.toContain('workspace projects');
			await expect(exists(join(root, 'node_modules'))).resolves.toBe(false);
			await expect(exists(join(root, 'pnpm-lock.yaml'))).resolves.toBe(false);
			await expect(exists(join(root, 'packages/member/node_modules'))).resolves.toBe(false);
			await expect(exists(join(root, 'packages/second/node_modules'))).resolves.toBe(false);
			await expect(
				exists(join(appDir, `node_modules/${DEPENDENCY}/package.json`)),
			).resolves.toBe(true);
			expect(stdoutWrites.join('')).toContain('is not one of its members');
		},
		TEST_TIMEOUT,
	);
});

// Tier 3. Everything above runs against a manifest holding one tiny dependency.
// That substitution is sound only if the real starter manifest behaves the same
// way, so this lane installs exactly what ships and asserts the app ends up with
// working dependencies of its own.
describe.skipIf(!enabled || !fullEnabled)('full template smoke', () => {
	test(
		'pnpm: the shipped template installs into the app and leaves the host alone',
		async () => {
			const lane = LANES.find((entry) => entry.manager === 'pnpm')!;
			const root = await makeTempDir('markless-pm-full-');
			await writeHostWorkspace(root, lane);
			const configPath = hostConfigPath(root, lane);
			const configBefore = await sha256File(configPath);

			const { appDir, install, stdoutWrites } = await scaffoldAndInstall(
				root,
				lane,
				'nested/newapp',
				{ manifest: 'template' },
			);

			// Guard the point of this lane: the manifest under test is the shipped
			// one, not the slim stand-in every Tier 2 lane installs.
			const manifest = JSON.parse(await readFile(join(appDir, 'package.json'), 'utf-8')) as {
				dependencies: Record<string, string>;
				devDependencies: Record<string, string>;
			};
			expect(Object.keys(manifest.dependencies).sort()).toEqual([
				'@markless/core',
				'@markless/router',
				'nitro',
				'vite-plus',
			]);
			expect(manifest.dependencies[DEPENDENCY]).toBeUndefined();
			expect(Object.keys(manifest.devDependencies)).toContain('@markless/analyzer');

			expect(install.command).toBe('pnpm');
			expect(install.args).toEqual([...lane.standaloneArgs]);
			expect(install.cwd).toBe(appDir);
			expect(install.output).not.toContain('workspace projects');

			// The enclosing workspace is byte-identical and gained nothing.
			await expect(sha256File(configPath)).resolves.toBe(configBefore);
			for (const entry of lane.hostStandaloneForbidden) {
				await expect(exists(join(root, entry)), `host/${entry}`).resolves.toBe(false);
			}
			await expect(exists(join(root, 'packages/member/node_modules'))).resolves.toBe(false);

			// The app's own dependencies resolve from the app directory. This is
			// the named replacement for the oracle's "dev command starts and
			// serves" assertion; see goal.md, "Named reduction".
			await expect(
				exists(join(appDir, 'node_modules/@markless/core/package.json')),
			).resolves.toBe(true);
			await expect(exists(join(appDir, 'node_modules/@markless/router'))).resolves.toBe(true);
			await expect(exists(join(appDir, 'node_modules/.bin/vp'))).resolves.toBe(true);

			expect(stdoutWrites.join('')).toContain('is not one of its members');
		},
		FULL_TEST_TIMEOUT,
	);
});
