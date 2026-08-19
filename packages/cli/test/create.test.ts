import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	access,
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
import { promisify } from 'node:util';
import { dirname, join } from 'pathe';
import { afterEach, expect, test, vi } from 'vitest';

const detectAgenticEnvironment = vi.hoisted(() =>
	vi.fn(() => ({ isAgentic: false, id: null, name: null, type: null })),
);
vi.mock('am-i-vibing', () => ({ detectAgenticEnvironment }));
import {
	CreateProgram,
	PROJECT_FORMAT_CHOICES,
	STARTER_CHOICES,
	detectEnclosingWorkspace,
	installDependencies,
	planInstall,
	type EnclosingWorkspace,
	type ManagerFlavor,
	type PackageManager,
	type ProgramRuntime,
} from '../src/index.ts';

type SpawnCall = { readonly command: string; readonly args: string[]; readonly cwd: string };

const cleanupRoots: string[] = [];
const execFileAsync = promisify(execFile);

afterEach(async () => {
	await Promise.all(
		cleanupRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
	);
});

const makeWorkspace = async () => {
	const root = await mkdtemp(join(tmpdir(), 'markless-router-cli-'));
	cleanupRoots.push(root);
	return root;
};

const exists = async (path: string) =>
	stat(path)
		.then(() => true)
		.catch(() => false);

test('keeps supported project choices and package shape visible', async () => {
	expect(PROJECT_FORMAT_CHOICES.map((choice) => choice.value)).toEqual(['node', 'deno', 'bun']);
	expect(PROJECT_FORMAT_CHOICES.map((choice) => choice.label)).toEqual(['Node', 'Deno', 'Bun']);
	expect(STARTER_CHOICES.map(({ label, value }) => ({ label, value }))).toEqual([
		{ label: 'Learn Markless', value: 'minimal' },
		{ label: 'Build an app', value: 'app' },
		{ label: 'Write docs', value: 'docs' },
		{ label: 'Full-stack app', value: 'full-stack' },
	]);
	expect(STARTER_CHOICES.find((choice) => choice.value === 'docs')?.hint).toBe(
		'An MDX docs site with a layout and sidebar components.',
	);

	const packageJson = JSON.parse(
		await readFile(new URL('../package.json', import.meta.url), 'utf-8'),
	) as {
		bin?: Record<string, string>;
		dependencies?: Record<string, string>;
		files: string[];
		name: string;
	};

	expect(packageJson).toMatchObject({
		name: 'create-markless',
	});
	expect(packageJson.bin).toEqual({
		'create-markless': './src/node.ts',
	});
	expect(packageJson.dependencies).toMatchObject({
		'@clack/prompts': expect.any(String),
	});
	expect(packageJson.files).toContain('templates');
	await expect(readFile(new URL('../src/node.ts', import.meta.url), 'utf-8')).resolves.toMatch(
		/^#!\/usr\/bin\/env node/,
	);
	await expect(access(new URL('../src/cli.ts', import.meta.url))).rejects.toThrow();

	const viteConfig = await readFile(new URL('../../../vite.config.ts', import.meta.url), 'utf-8');
	// Per-package pack config (release restructure): the cli package builds its
	// own dist with an index entry; the old root-level 'cli/index' entry is gone.
	expect(viteConfig).toMatch(/packageName: 'cli'[\s\S]*?index: '\.\/src\/index\.ts'/);
	expect(viteConfig).not.toContain("'cli/cli'");
});

test('keeps CLI templates external and uses shared path and URL helpers', async () => {
	const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf-8');

	expect(source).toContain("from 'pathe'");
	expect(source).toContain("from 'ufo'");
	expect(source).not.toMatch(/from 'node:(child_process|fs|fs\/promises|path|process|url)'/);
	expect(source).not.toMatch(/\bprocess\./);
	expect(source).not.toContain('spawnSync');
	expect(source).not.toContain('function docsHomePage');
	expect(source).not.toContain('function tsconfig');
	expect(source).not.toContain('function packageManifest');
	expect(source).not.toContain('plugins: [markless(), router()]');
});

test('node executable delegates to the testable host adapter outside the reusable program', async () => {
	const nodeAdapter = await readFile(new URL('../src/node.ts', import.meta.url), 'utf-8');
	const nodeRuntime = await readFile(new URL('../src/node-runtime.ts', import.meta.url), 'utf-8');
	const programSource = await readFile(new URL('../src/index.ts', import.meta.url), 'utf-8');

	expect(nodeAdapter).toContain('process.argv.slice(2)');
	expect(nodeAdapter).toContain('new CreateProgram().run');
	expect(nodeAdapter).toContain("from './node-runtime.ts'");
	expect(nodeRuntime).toContain("from '@clack/prompts'");
	expect(nodeRuntime).toContain("from 'node:child_process'");
	expect(nodeRuntime).toContain("from 'node:fs/promises'");
	expect(nodeRuntime).not.toContain("from 'node:readline");
	expect(programSource).not.toMatch(
		/from 'node:(child_process|fs|fs\/promises|path|process|url)'/,
	);
	expect(programSource).not.toMatch(/\bprocess\./);
});

test('--yes selects deterministic minimal Node defaults', async () => {
	const root = await makeWorkspace();

	const program = new CreateProgram();
	const input = program.validate(['my-app', '--yes'], runtime(root));
	const options = await program.interact(input, runtime(root));

	expect(options).toMatchObject({
		format: 'node',
		git: true,
		install: true,
		packageManager: 'pnpm',
		starter: 'minimal',
		target: 'my-app',
	});
});

test('prompts interactively when a TTY run has no target', async () => {
	const root = await makeWorkspace();
	const events: string[] = [];
	const program = new CreateProgram();

	await program.run(
		[],
		runtime(root, {
			isTTY: true,
			prompts: {
				intro(message) {
					events.push(`intro:${message}`);
				},
				async select({ message, options, initialValue }) {
					events.push(
						`select:${message}:${initialValue}:${options
							.map((option) => `${option.label}|${option.hint}`)
							.join(',')}`,
					);
					if (message === 'What are you building today?') return 'docs';
					if (message === 'Where should it run?') return 'node';
					if (message === 'Install dependencies now?') return 'no';
					if (message === 'Initialize git?') return 'no';
					if (message === 'Ready to create?') return 'create';
					throw new Error(`Unexpected select prompt: ${message}`);
				},
				async multiselect() {
					throw new Error('No agents should be found in this test.');
				},
				async text({ initialValue, message, placeholder, validate }) {
					events.push(`text:${message}:${initialValue}:${placeholder}`);
					expect(validate?.('')).toBe('Project name cannot be empty.');
					return 'interactive-docs';
				},
				note(message, title) {
					events.push(`note:${title}:${message}`);
				},
				outro(message) {
					events.push(`outro:${message}`);
				},
				cancel(message) {
					events.push(`cancel:${message}`);
				},
			},
		}),
	);

	expect(events[0]).toBe('intro:Welcome to Markless');
	expect(events).toContain(
		"note:Let's build you an app.:Choose a starting point, and Markless will set up the routes, scripts, and defaults.",
	);
	expect(events).toContain(
		'select:What are you building today?:minimal:Learn Markless|A small TSRX counter app. Best first project.,Build an app|A routed app with document.tsrx plus 404 and 500 pages.,Write docs|An MDX docs site with a layout and sidebar components.,Full-stack app|App routes plus api/ and middleware/ files.',
	);
	expect(events).toContain('text:What should we call it?:my-markless-app:my-markless-app');
	expect(events).toContain(
		'select:Where should it run?:node:Node|Creates a package.json project for pnpm, npm, or yarn.,Deno|Creates a deno.json project with npm: imports.,Bun|Creates a package.json project tuned for Bun.',
	);
	expect(events).toContain(
		'select:Install dependencies now?:yes:Yes|Runs pnpm install after files are created.,No|Leaves dependencies for you to install later.',
	);
	expect(events).toContain(
		'select:Initialize git?:yes:Yes|Runs git init in the app directory.,No|Leaves version control untouched.',
	);
	expect(events).toContain(
		'note:Ready to create?:App:      interactive-docs\nStarter:  Write docs\nRuntime:  Node\nInstall:  No\nGit:      No',
	);
	expect(events).toContain('select:Ready to create?:create:Create app|,Cancel|');
	expect(events).toContain(
		'note:Created interactive-docs:Next steps:\n  cd interactive-docs\n  pnpm dev\n\nThen open:\n  http://localhost:5173',
	);
	expect(events).toContain('outro:Markless app ready.');
	await expect(exists(join(root, 'interactive-docs/pages/index.mdx'))).resolves.toBe(true);
	await expect(exists(join(root, 'interactive-docs/document.tsrx'))).resolves.toBe(true);
});

test('creates a minimal Markless Router app with TSRX pages and Nitro-backed deps', async () => {
	const root = await makeWorkspace();

	const program = new CreateProgram();
	const input = program.validate(['my-app', '--yes'], runtime(root));
	const options = await program.interact(input, runtime(root));
	await program.execute({ ...options, install: false, git: false }, runtime(root));

	const appRoot = join(root, 'my-app');
	const packageJson = JSON.parse(await readFile(join(appRoot, 'package.json'), 'utf-8')) as {
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
		scripts: Record<string, string>;
	};
	const viteConfig = await readFile(join(appRoot, 'vite.config.ts'), 'utf-8');
	const gitignore = await readFile(join(appRoot, '.gitignore'), 'utf-8');
	const tsconfig = JSON.parse(await readFile(join(appRoot, 'tsconfig.json'), 'utf-8')) as {
		tsrx?: { compiler?: string };
		compilerOptions: { jsx?: string; plugins: Array<{ name: string }> };
	};
	const vscodeSettings = JSON.parse(
		await readFile(join(appRoot, '.vscode/settings.json'), 'utf-8'),
	) as unknown;
	const vscodeExtensions = JSON.parse(
		await readFile(join(appRoot, '.vscode/extensions.json'), 'utf-8'),
	) as unknown;
	const zedSettings = await readFile(join(appRoot, '.zed/settings.json'), 'utf-8');
	const zedSettingsTemplate = await readFile(
		new URL('../templates/common/.zed/settings.json', import.meta.url),
		'utf-8',
	);

	expect(packageJson.scripts).toMatchObject({
		build: 'vp build',
		check: 'vp check',
		dev: 'vp dev',
		doctor: 'node scripts/markless-doctor.mjs',
		preview: 'vp preview',
		test: 'vp test',
	});
	expect(packageJson.dependencies).toMatchObject({
		'@markless/router': expect.any(String),
		'@markless/core': expect.any(String),
		nitro: expect.any(String),
		'vite-plus': expect.any(String),
	});
	expect(packageJson.devDependencies).toMatchObject({
		'@markless/analyzer': expect.any(String),
		'@markless/typescript-plugin': expect.any(String),
		typescript: expect.any(String),
		vite: expect.any(String),
	});
	// The upstream TSRX extension already claims `.tsrx` through its own language contribution,
	// so the scaffold must NOT pin a `files.associations` entry: naming a language id that no
	// longer exists is what silently kills syntax highlighting in a scaffolded app.
	expect(vscodeSettings).toEqual({
		'emmet.includeLanguages': {
			ripple: 'html',
		},
	});
	// Editor support comes from the upstream extension plus @markless/typescript-plugin.
	// Recommending it (and never marking it unwanted) is the whole editor setup story.
	expect(vscodeExtensions).toEqual({
		recommendations: ['ripple-ts.ripple-ts-vscode-plugin'],
	});
	expect(zedSettings).toBe(zedSettingsTemplate);
	await expect(exists(join(appRoot, 'AGENTS.md'))).resolves.toBe(false);
	await expect(exists(join(appRoot, 'CLAUDE.md'))).resolves.toBe(false);
	await expect(exists(join(appRoot, '.claude'))).resolves.toBe(false);
	await expect(exists(join(appRoot, '.codex'))).resolves.toBe(false);
	await expect(exists(join(appRoot, '.gemini'))).resolves.toBe(false);
	await expect(exists(join(appRoot, '.copilot'))).resolves.toBe(false);
	await expect(exists(join(appRoot, '.cursor'))).resolves.toBe(false);
	await expect(
		readFile(join(appRoot, 'scripts/markless-doctor.mjs'), 'utf-8'),
	).resolves.toBeTruthy();
	await expect(exists(join(appRoot, 'pages/index.tsrx'))).resolves.toBe(true);
	await expect(exists(join(appRoot, 'public'))).resolves.toBe(true);
	await expect(exists(join(appRoot, 'nitro.config.ts'))).resolves.toBe(false);
	await expect(exists(join(appRoot, 'markless.config.ts'))).resolves.toBe(false);
	await expect(exists(join(appRoot, 'src/pages'))).resolves.toBe(false);
	await expect(exists(join(appRoot, 'pages/api'))).resolves.toBe(false);
	await expect(readFile(join(appRoot, 'vite.config.ts'), 'utf-8')).resolves.toContain(
		"import { router } from '@markless/router/vite';",
	);
	expect(viteConfig).toContain('plugins: [markless(), router()]');
	expect(viteConfig).not.toContain('@vitejs/devtools');
	expect(viteConfig).not.toContain('DevTools');
	expect(viteConfig).not.toContain('nitro()');
	expect(gitignore).toBe('node_modules/\ndist/\n.vite/\n*.log\n.DS_Store\n');
	await expect(exists(join(appRoot, 'gitignore'))).resolves.toBe(false);
	await expect(readFile(join(appRoot, 'tsconfig.json'), 'utf-8')).resolves.not.toContain('tsx');
	await expect(exists(join(appRoot, 'pages/index.tsx'))).resolves.toBe(false);
	// The nested upstream TypeScript plugin reaches the Markless compiler only through this
	// top-level declaration. Drop it and the scaffolded app opens with a silently dead editor.
	expect(tsconfig.tsrx?.compiler).toBe('@markless/typescript-plugin/volar');
	// Importing a component with its .tsrx extension resolves to a TSX service script;
	// without a jsx setting TypeScript reports TS6142 on that import.
	expect(tsconfig.compilerOptions.jsx).toBe('preserve');
	expect(tsconfig.compilerOptions.plugins.map((plugin) => plugin.name)).toEqual([
		'@markless/typescript-plugin',
		'@markless/router/typescript-plugin',
	]);
});

test('packs no repository agent configuration templates', async () => {
	const cache = await makeWorkspace();
	const cliRoot = new URL('..', import.meta.url);
	const { stdout } = await execFileAsync('npm', ['pack', '--dry-run', '--json'], {
		cwd: cliRoot,
		env: { ...process.env, npm_config_cache: cache },
	});
	// npm 11 and earlier report `npm pack --json` as an array of package summaries; npm 12
	// reports an object keyed by package name. Accept either so the assertions below stay
	// about the packed file list rather than the installed npm's report shape.
	type PackReport = { files: Array<{ path: string }> };
	const report = JSON.parse(stdout) as PackReport[] | Record<string, PackReport>;
	const [{ files }] = Array.isArray(report) ? report : Object.values(report);
	const packedPaths = files.map((file) => file.path);

	expect(packedPaths).not.toContain('templates/common/AGENTS.md');
	expect(packedPaths).not.toContain(
		'templates/common/.claude/skills/markless-debugging/SKILL.md',
	);
	expect(packedPaths).toContain('templates/common/scripts/markless-doctor.mjs');
	expect(packedPaths).toContain('templates/common/gitignore');
	expect(packedPaths).not.toContain('templates/common/.gitignore');
});

test('generates app and full-stack status pages under pages', async () => {
	await Promise.all(
		(['app', 'full-stack'] as const).map(async (starter) => {
			const root = await makeWorkspace();
			const program = new CreateProgram();

			await program.run(
				[`${starter}-app`, '--starter', starter, '--no-install', '--no-git'],
				runtime(root),
			);

			const appRoot = join(root, `${starter}-app`);
			const tsconfigJson = await readFile(join(appRoot, 'tsconfig.json'), 'utf-8');
			const gitignore = await readFile(join(appRoot, '.gitignore'), 'utf-8');

			await expect(exists(join(appRoot, 'pages/404.tsrx'))).resolves.toBe(true);
			await expect(exists(join(appRoot, 'pages/500.tsrx'))).resolves.toBe(true);
			await expect(exists(join(appRoot, '404.tsrx'))).resolves.toBe(false);
			await expect(exists(join(appRoot, '500.tsrx'))).resolves.toBe(false);
			expect(tsconfigJson).toContain('"pages"');
			expect(tsconfigJson).toContain('"compiler": "@markless/typescript-plugin/volar"');
			expect(tsconfigJson).not.toContain('"404.tsrx"');
			expect(tsconfigJson).not.toContain('"500.tsrx"');
			expect(gitignore).toContain('node_modules/');
			expect(gitignore).toContain('dist/');
			expect(gitignore).toContain('.vite/');
			expect(gitignore).toContain('*.log');
			expect(gitignore).toContain('.DS_Store');
			await expect(exists(join(appRoot, 'gitignore'))).resolves.toBe(false);
		}),
	);
});

test('generates Deno format imports with Nitro available', async () => {
	const root = await makeWorkspace();
	const program = new CreateProgram();

	await program.run(['deno-app', '--format', 'deno', '--no-install', '--no-git'], runtime(root));

	const appRoot = join(root, 'deno-app');
	const denoJson = JSON.parse(await readFile(join(appRoot, 'deno.json'), 'utf-8')) as {
		imports: Record<string, string>;
		nodeModulesDir?: string;
		tasks: Record<string, string>;
	};
	const tsconfig = JSON.parse(await readFile(join(appRoot, 'tsconfig.json'), 'utf-8')) as {
		tsrx?: { compiler?: string };
		compilerOptions: { plugins: Array<{ name: string }> };
	};
	const readme = await readFile(join(appRoot, 'README.md'), 'utf-8');

	expect(denoJson.nodeModulesDir).toBe('auto');
	expect(denoJson.imports).toMatchObject({
		'@markless/core': expect.stringMatching(/^npm:@markless\/core@\^/),
		'@markless/router': expect.stringMatching(/^npm:@markless\/router@\^/),
		nitro: 'npm:nitro@3.0.260429-beta',
	});
	// tsconfig.json is shared by all three formats, so a Deno app gets the same editor
	// wiring the Node and Bun apps get. Deno's own language server ignores it — it reads
	// deno.json and reports `plugins` as an unsupported compiler option — but tsserver-based
	// editors read it, and they resolve both the plugin and the declared compiler from the
	// app's node_modules, which `deno install` populates from these imports. Without the
	// import the app declares an editor toolchain it never installs, and .tsrx files are read
	// as plain TypeScript: no intrinsic tag completions, and `count` types as any.
	expect(denoJson.imports['@markless/typescript-plugin']).toMatch(
		/^npm:@markless\/typescript-plugin@\^/,
	);
	expect(tsconfig.tsrx?.compiler).toBe('@markless/typescript-plugin/volar');
	expect(tsconfig.compilerOptions.plugins.map((plugin) => plugin.name)).toEqual([
		'@markless/typescript-plugin',
		'@markless/router/typescript-plugin',
	]);
	// No doctor task, deliberately: scripts/markless-doctor.mjs reads package.json, which the
	// Deno format does not create, so the task would crash on its first line. Make the doctor
	// read deno.json before adding one here.
	expect(denoJson.tasks.doctor).toBeUndefined();
	expect(Object.keys(denoJson.tasks)).toEqual([
		'dev',
		'build',
		'preview',
		'check',
		'fmt',
		'test',
	]);
	// The limitation is recorded for the app author, not just for us.
	expect(readme).toContain("Deno's language server does not");
});

test('generates docs with MDX routes and component layouts only', async () => {
	const root = await makeWorkspace();
	const program = new CreateProgram();

	await program.run(['docs-app', '--starter', 'docs', '--no-install', '--no-git'], runtime(root));

	const appRoot = join(root, 'docs-app');
	const viteConfig = await readFile(join(appRoot, 'vite.config.ts'), 'utf-8');
	const indexMdx = await readFile(join(appRoot, 'pages/index.mdx'), 'utf-8');
	const catchAllMdx = await readFile(join(appRoot, 'pages/docs/[...slug].mdx'), 'utf-8');

	await expect(exists(join(appRoot, 'document.tsrx'))).resolves.toBe(true);
	await expect(exists(join(appRoot, 'pages/index.tsrx'))).resolves.toBe(false);
	await expect(exists(join(appRoot, 'pages/docs/index.mdx'))).resolves.toBe(true);
	await expect(exists(join(appRoot, 'components/docs/Sidebar.tsrx'))).resolves.toBe(true);
	await expect(exists(join(appRoot, 'components/layouts/DocsLayout.tsrx'))).resolves.toBe(true);
	expect(indexMdx).toContain('# Markless Router Docs');
	expect(catchAllMdx).toContain('<DocsLayout');
	expect(catchAllMdx).toContain('<Content />');
	expect(viteConfig).not.toContain('mdx');

	await expect(exists(join(appRoot, 'content'))).resolves.toBe(false);
	await expect(exists(join(appRoot, 'collections'))).resolves.toBe(false);
	await expect(exists(join(appRoot, 'pages/api'))).resolves.toBe(false);
	await expect(exists(join(appRoot, 'nitro.config.ts'))).resolves.toBe(false);
});

test('scaffolded manifests pin @markless deps to the publishing cli version, never workspace links', async () => {
	const cliManifest = JSON.parse(
		await readFile(new URL('../package.json', import.meta.url), 'utf-8'),
	) as { version: string };
	expect(cliManifest.version).toMatch(/^\d+\.\d+\.\d+/);
	const expectedRange = `^${cliManifest.version}`;

	await Promise.all(
		(['node', 'bun'] as const).map(async (format) => {
			const root = await makeWorkspace();
			const program = new CreateProgram();

			await program.run(
				[`${format}-pin-app`, '--format', format, '--no-install', '--no-git'],
				runtime(root),
			);

			const appManifest = JSON.parse(
				await readFile(join(root, `${format}-pin-app/package.json`), 'utf-8'),
			) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };

			expect(appManifest.dependencies['@markless/core']).toBe(expectedRange);
			expect(appManifest.dependencies['@markless/router']).toBe(expectedRange);
			expect(appManifest.devDependencies['@markless/analyzer']).toBe(expectedRange);
			expect(appManifest.devDependencies['@markless/typescript-plugin']).toBe(expectedRange);
			for (const [name, range] of [
				...Object.entries(appManifest.dependencies),
				...Object.entries(appManifest.devDependencies),
			]) {
				expect(range, `${format} dep ${name}`).not.toContain('workspace:');
				expect(range, `${format} dep ${name}`).not.toContain('catalog:');
				expect(range, `${format} dep ${name}`).not.toContain('link:');
				expect(range, `${format} dep ${name}`).not.toContain('file:');
			}
		}),
	);

	const denoRoot = await makeWorkspace();
	await new CreateProgram().run(
		['deno-pin-app', '--format', 'deno', '--no-install', '--no-git'],
		runtime(denoRoot),
	);
	const denoJson = JSON.parse(
		await readFile(join(denoRoot, 'deno-pin-app/deno.json'), 'utf-8'),
	) as { imports: Record<string, string> };

	expect(denoJson.imports['@markless/core']).toBe(`npm:@markless/core@${expectedRange}`);
	expect(denoJson.imports['@markless/router']).toBe(`npm:@markless/router@${expectedRange}`);
	expect(denoJson.imports['@markless/typescript-plugin']).toBe(
		`npm:@markless/typescript-plugin@${expectedRange}`,
	);
});

test('rejects --yes without a positional target', async () => {
	const root = await makeWorkspace();
	const program = new CreateProgram();

	expect(() => program.validate(['--yes'], runtime(root))).toThrow(
		'Project name is required when running non-interactively.',
	);
});

const writeFiles = async (root: string, files: Record<string, string>) => {
	for (const [path, contents] of Object.entries(files)) {
		const full = join(root, path);
		await mkdir(dirname(full), { recursive: true });
		await writeFile(full, contents);
	}
};

const hostManifest = (workspaces: unknown) =>
	`${JSON.stringify({ name: 'host', private: true, workspaces }, null, 2)}\n`;

/**
 * The host workspace shape every lane is scaffolded into: a root declaring
 * `packages/*` (or the deno equivalent) plus one real member. Passing
 * `memberPath` adds the new app to the declaration, which is the already-a-member
 * case deno needs spelled out because it lists explicit paths.
 */
const hostWorkspaceFiles = (flavor: ManagerFlavor, memberPath?: string): Record<string, string> => {
	const member = {
		'packages/member/package.json': `${JSON.stringify({ name: 'member', version: '1.0.0' }, null, 2)}\n`,
	};

	if (flavor === 'deno') {
		return {
			...member,
			'deno.json': `${JSON.stringify(
				{ workspace: ['./packages/member', ...(memberPath ? [`./${memberPath}`] : [])] },
				null,
				2,
			)}\n`,
		};
	}
	if (flavor === 'pnpm') {
		return { ...member, 'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n" };
	}
	if (flavor === 'yarn-berry') {
		return { ...member, 'package.json': hostManifest(['packages/*']), 'yarn.lock': '' };
	}
	return { ...member, 'package.json': hostManifest(['packages/*']) };
};

const detect = async (
	root: string,
	manager: PackageManager,
	targetDir: string,
	userAgent?: string,
) =>
	await detectEnclosingWorkspace({
		env: { npm_config_user_agent: userAgent ?? `${manager}/1.0.0` },
		fs: runtime(root).fs,
		manager,
		targetDir,
	});

// A workspace root above the fixture belongs to the machine running the test,
// not to the fixture, so negative assertions only look inside the fixture.
const insideFixture = (found: EnclosingWorkspace | null, root: string) =>
	found && found.root.startsWith(root) ? found : null;

const MANAGER_LANES = [
	{
		flavor: 'npm',
		format: 'node',
		manager: 'npm',
		standaloneArgs: ['install', '--workspaces=false'],
		userAgent: 'npm/12.0.1 node/v24.15.0',
	},
	{
		flavor: 'pnpm',
		format: 'node',
		manager: 'pnpm',
		standaloneArgs: ['install', '--ignore-workspace'],
		userAgent: 'pnpm/10.33.2 npm/? node/v24.15.0',
	},
	{
		flavor: 'yarn-classic',
		format: 'node',
		manager: 'yarn',
		standaloneArgs: ['install'],
		userAgent: 'yarn/1.22.22 npm/? node/v24.15.0',
	},
	{
		flavor: 'yarn-berry',
		format: 'node',
		manager: 'yarn',
		standaloneArgs: ['install'],
		userAgent: 'yarn/4.17.1 npm/? node/v24.15.0',
	},
	{
		flavor: 'bun',
		format: 'node',
		manager: 'bun',
		standaloneArgs: ['install'],
		userAgent: 'bun/1.3.14 npm/? node/v24.15.0',
	},
	{
		flavor: 'deno',
		format: 'deno',
		manager: 'deno',
		standaloneArgs: ['install'],
		userAgent: 'deno/2.8.3 npm/? deno/2.8.3',
	},
] as const satisfies readonly {
	flavor: ManagerFlavor;
	format: 'node' | 'deno';
	manager: PackageManager;
	standaloneArgs: readonly string[];
	userAgent: string;
}[];

/**
 * Drives the production path — validate, interact (which is where detection
 * runs), then the same install step `execute` calls — and hands back everything
 * the CLI would have done to the outside world.
 */
const installThroughCli = async (
	root: string,
	lane: (typeof MANAGER_LANES)[number],
	appPath: string,
) => {
	const spawnCalls: SpawnCall[] = [];
	const stdoutWrites: string[] = [];
	const host = runtime(root, {
		env: { npm_config_user_agent: lane.userAgent },
		spawnCalls,
		stdoutWrites,
	});
	const targetDir = join(root, appPath);
	await mkdir(targetDir, { recursive: true });

	const program = new CreateProgram();
	const input = program.validate(
		[appPath, '--yes', '--agents', 'none', '--format', lane.format],
		host,
	);
	const created = await program.interact(input, host);
	await installDependencies(created, targetDir, host);

	return { created, spawnCalls, stdoutWrites, targetDir };
};

/**
 * Drives the whole CLI, including `execute`, which is where the enclosing
 * workspace config is written. Returns everything the run did to the outside
 * world.
 */
const runThroughCli = async (
	root: string,
	lane: (typeof MANAGER_LANES)[number],
	appPath: string,
	extraArgs: readonly string[] = [],
) => {
	const spawnCalls: SpawnCall[] = [];
	const stdoutWrites: string[] = [];
	const host = runtime(root, {
		env: { npm_config_user_agent: lane.userAgent },
		spawnCalls,
		stdoutWrites,
	});

	await new CreateProgram().run(
		[appPath, '--yes', '--agents', 'none', '--no-git', '--format', lane.format, ...extraArgs],
		host,
	);

	return { spawnCalls, stdoutWrites, targetDir: join(root, appPath) };
};

const lane = (flavor: ManagerFlavor) => MANAGER_LANES.find((entry) => entry.flavor === flavor)!;

/**
 * One case per config format, each carrying the formatting a real repo has:
 * comments, a non-default indent, tabs, a single-line array, the object form of
 * `workspaces`. `after` is written out in full so the assertion is byte-exact
 * rather than "parses to the same thing".
 */
const JOIN_CASES = [
	{
		after: [
			'# yuku-tsrx is consumed through the generated self-contained local host.',
			'packages:',
			"    - 'packages/*'",
			"    - 'nested/newapp'",
			'',
			'catalogs:',
			'    default:',
			'        vite: ^7.0.0',
			'',
		].join('\n'),
		before: [
			'# yuku-tsrx is consumed through the generated self-contained local host.',
			'packages:',
			"    - 'packages/*'",
			'',
			'catalogs:',
			'    default:',
			'        vite: ^7.0.0',
			'',
		].join('\n'),
		configFile: 'pnpm-workspace.yaml',
		flavor: 'pnpm',
		what: 'a commented, four-space pnpm-workspace.yaml',
	},
	{
		after: '{\n  "name": "host",\n  "private": true,\n  "workspaces": [\n    "packages/*",\n    "nested/newapp"\n  ]\n}\n',
		before: '{\n  "name": "host",\n  "private": true,\n  "workspaces": [\n    "packages/*"\n  ]\n}\n',
		configFile: 'package.json',
		flavor: 'npm',
		what: 'a two-space package.json with a multi-line workspaces array',
	},
	{
		after: '{\n\t"name": "host",\n\t"workspaces": ["packages/*", "nested/newapp"],\n\t"private": true\n}\n',
		before: '{\n\t"name": "host",\n\t"workspaces": ["packages/*"],\n\t"private": true\n}\n',
		configFile: 'package.json',
		flavor: 'yarn-classic',
		what: 'a tab-indented package.json whose workspaces array is on one line',
	},
	{
		after: '{\n\t"name": "host",\n\t"private": true,\n\t"workspaces": [\n\t\t"packages/*",\n\t\t"nested/newapp"\n\t]\n}\n',
		before: '{\n\t"name": "host",\n\t"private": true,\n\t"workspaces": [\n\t\t"packages/*"\n\t]\n}\n',
		configFile: 'package.json',
		extraHost: { 'yarn.lock': '' },
		flavor: 'yarn-berry',
		what: 'a tab-indented package.json with a multi-line workspaces array',
	},
	{
		after: '{\n  "name": "host",\n  "workspaces": {\n    "nohoist": ["**/left-pad"],\n    "packages": ["packages/*", "nested/newapp"]\n  }\n}\n',
		before: '{\n  "name": "host",\n  "workspaces": {\n    "nohoist": ["**/left-pad"],\n    "packages": ["packages/*"]\n  }\n}\n',
		configFile: 'package.json',
		flavor: 'bun',
		what: 'the object form of workspaces, written into its packages key',
	},
	{
		after: '{\n\t// the members of this workspace\n\t"workspace": ["./packages/member", "./nested/newapp"],\n}\n',
		before: '{\n\t// the members of this workspace\n\t"workspace": ["./packages/member"],\n}\n',
		configFile: 'deno.jsonc',
		flavor: 'deno',
		what: 'a commented deno.jsonc with a trailing comma',
	},
] as const satisfies readonly {
	after: string;
	before: string;
	configFile: string;
	extraHost?: Record<string, string>;
	flavor: ManagerFlavor;
	what: string;
}[];

test('joining writes exactly one member entry and leaves every other byte alone', async () => {
	for (const joinCase of JOIN_CASES) {
		const root = await makeWorkspace();
		const hostFiles = {
			[joinCase.configFile]: joinCase.before,
			...('extraHost' in joinCase ? joinCase.extraHost : {}),
		};
		await writeFiles(root, hostFiles);

		const { spawnCalls, stdoutWrites } = await runThroughCli(
			root,
			lane(joinCase.flavor),
			'nested/newapp',
			['--workspace'],
		);

		await expect(
			readFile(join(root, joinCase.configFile), 'utf-8'),
			`${joinCase.flavor}: ${joinCase.what}`,
		).resolves.toBe(joinCase.after);
		// The install runs at the workspace root: that is the only directory the
		// manager resolves the app from now that it is a declared member.
		expect(spawnCalls, joinCase.flavor).toEqual([
			{ args: ['install'], command: lane(joinCase.flavor).manager, cwd: root },
		]);
		expect(stdoutWrites.join(''), joinCase.flavor).toContain(
			`Added "nested/newapp" to ${joinCase.configFile} and installing at ${root}`,
		);
		expect(stdoutWrites.join(''), joinCase.flavor).not.toContain('is not one of its members');
	}
});

test('leaves the enclosing config untouched unless the user asked to join', async () => {
	for (const joinCase of JOIN_CASES) {
		for (const args of [[], ['--no-workspace']]) {
			const root = await makeWorkspace();
			await writeFiles(root, {
				[joinCase.configFile]: joinCase.before,
				...('extraHost' in joinCase ? joinCase.extraHost : {}),
			});

			const { spawnCalls, targetDir } = await runThroughCli(
				root,
				lane(joinCase.flavor),
				'nested/newapp',
				args,
			);

			await expect(
				readFile(join(root, joinCase.configFile), 'utf-8'),
				`${joinCase.flavor} with ${args.join(' ') || 'no flag'}`,
			).resolves.toBe(joinCase.before);
			expect(spawnCalls[0]?.cwd, joinCase.flavor).toBe(targetDir);
		}
	}
});

test('tells a default run that joining was an option, and a chosen run nothing of the sort', async () => {
	const root = await makeWorkspace();
	await writeFiles(root, hostWorkspaceFiles('pnpm'));
	const fallback = await runThroughCli(root, lane('pnpm'), 'nested/newapp');

	expect(fallback.stdoutWrites.join('')).toContain(
		'Pass --workspace to add it to that workspace instead.',
	);

	const chosen = await makeWorkspace();
	await writeFiles(chosen, hostWorkspaceFiles('pnpm'));
	const explicit = await runThroughCli(chosen, lane('pnpm'), 'nested/newapp', ['--no-workspace']);

	expect(explicit.stdoutWrites.join('')).toContain('is not one of its members');
	expect(explicit.stdoutWrites.join('')).not.toContain('Pass --workspace');
});

test('refuses, explains, and still succeeds when a declared member cannot install on its own', async () => {
	// bun swallows --ignore-workspace and hoists anyway, yarn classic has no
	// equivalent flag, and deno only isolates directories its workspace does not
	// declare. Installing nothing is the honest outcome.
	for (const flavor of ['yarn-classic', 'bun', 'deno'] as const) {
		const root = await makeWorkspace();
		await writeFiles(root, hostWorkspaceFiles(flavor, 'packages/newapp'));

		const { spawnCalls, stdoutWrites } = await runThroughCli(
			root,
			lane(flavor),
			'packages/newapp',
			['--no-workspace'],
		);
		const output = stdoutWrites.join('');
		const manager = lane(flavor).manager;

		expect(spawnCalls, flavor).toEqual([]);
		expect(output, flavor).toContain('Skipped installing dependencies.');
		expect(output, flavor).toContain(
			`packages/newapp is inside the ${manager} workspace at ${root}, and ${manager} provides no way to install a workspace member on its own.`,
		);
		expect(output, flavor).toContain(
			`To install: run \`${manager} install\` at ${root}, or move packages/newapp outside that workspace.`,
		);
		// A skipped install is not a failed one: the app is still scaffolded.
		const manifest = lane(flavor).format === 'deno' ? 'deno.json' : 'package.json';
		await expect(exists(join(root, 'packages/newapp', manifest)), flavor).resolves.toBe(true);
	}
});

test('installs a declared member on its own when the manager offers a way to', async () => {
	const expected: Record<string, readonly string[]> = {
		npm: ['install', '--workspaces=false'],
		pnpm: ['install', '--ignore-workspace'],
		'yarn-berry': ['install'],
	};

	for (const flavor of ['npm', 'pnpm', 'yarn-berry'] as const) {
		const root = await makeWorkspace();
		await writeFiles(root, hostWorkspaceFiles(flavor, 'packages/newapp'));

		const { spawnCalls, stdoutWrites, targetDir } = await runThroughCli(
			root,
			lane(flavor),
			'packages/newapp',
			['--no-workspace'],
		);

		expect(spawnCalls, flavor).toEqual([
			{ args: [...expected[flavor]!], command: lane(flavor).manager, cwd: targetDir },
		]);
		expect(stdoutWrites.join(''), flavor).toContain(
			`packages/newapp is inside the ${lane(flavor).manager} workspace at ${root}, but --no-workspace was passed`,
		);
		await expect(exists(join(targetDir, 'yarn.lock'))).resolves.toBe(flavor === 'yarn-berry');
	}
});

/**
 * Drives the interactive flow, answering the workspace question with
 * `workspaceAnswer` and recording every prompt so the copy can be asserted.
 */
const promptThroughCli = async (
	root: string,
	appPath: string,
	workspaceAnswer: 'separate' | 'join' | null,
) => {
	const events: string[] = [];
	const spawnCalls: SpawnCall[] = [];

	await new CreateProgram().run(
		[appPath, '--agents', 'none', '--no-git'],
		runtime(root, {
			env: { npm_config_user_agent: 'pnpm/10.33.2' },
			isTTY: true,
			spawnCalls,
			prompts: {
				intro() {},
				async select({ message, options, initialValue }) {
					events.push(
						`select:${message}:${initialValue}:${options
							.map((option) => `${option.label}|${option.hint}`)
							.join(',')}`,
					);
					if (message === 'What are you building today?') return 'minimal';
					if (message === 'Where should it run?') return 'node';
					if (message === 'Install dependencies now?') return 'yes';
					if (message === 'Initialize git?') return 'no';
					if (message === 'Ready to create?') return 'create';
					if (message === `How should ${appPath} be installed?`) {
						if (!workspaceAnswer) throw new Error('Unexpected workspace prompt.');
						return workspaceAnswer;
					}
					throw new Error(`Unexpected select prompt: ${message}`);
				},
				async multiselect() {
					throw new Error('No agents should be found in this test.');
				},
				async text() {
					throw new Error('The target is passed as an argument.');
				},
				note(message, title) {
					events.push(`note:${title}:${message}`);
				},
				outro() {},
				cancel() {},
			},
		}),
	);

	return { events, spawnCalls };
};

test('asks how to install an app that would land inside a workspace it does not belong to', async () => {
	const root = await makeWorkspace();
	const before = "packages:\n  - 'packages/*'\n";
	await writeFiles(root, { 'pnpm-workspace.yaml': before });

	const { events, spawnCalls } = await promptThroughCli(root, 'newapp', 'join');

	expect(events).toContain(
		`note:undefined:Found a pnpm workspace at ${root}\nnewapp would not be one of its members.`,
	);
	expect(events).toContain(
		`select:How should newapp be installed?:separate:Keep it separate (recommended)|Installs only newapp. ${root} is not modified.,Add it to the pnpm workspace|Adds "newapp" to pnpm-workspace.yaml and installs at ${root}.`,
	);
	expect(events.join('\n')).toContain(`Workspace: Joining ${root}`);
	await expect(readFile(join(root, 'pnpm-workspace.yaml'), 'utf-8')).resolves.toBe(
		"packages:\n  - 'packages/*'\n  - 'newapp'\n",
	);
	expect(spawnCalls).toEqual([{ args: ['install'], command: 'pnpm', cwd: root }]);
});

test('keeps the app separate when the prompt is answered that way', async () => {
	const root = await makeWorkspace();
	const before = "packages:\n  - 'packages/*'\n";
	await writeFiles(root, { 'pnpm-workspace.yaml': before });

	const { events, spawnCalls } = await promptThroughCli(root, 'newapp', 'separate');

	expect(events.join('\n')).toContain(`Workspace: Separate from ${root}`);
	await expect(readFile(join(root, 'pnpm-workspace.yaml'), 'utf-8')).resolves.toBe(before);
	expect(spawnCalls).toEqual([
		{ args: ['install', '--ignore-workspace'], command: 'pnpm', cwd: join(root, 'newapp') },
	]);
});

test('never asks, and never reports a workspace, for an app that is already a member', async () => {
	const root = await makeWorkspace();
	await writeFiles(root, { 'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n" });

	// A null answer makes the workspace prompt throw, so reaching the end proves
	// it was never shown.
	const { events, spawnCalls } = await promptThroughCli(root, 'packages/newapp', null);

	expect(events.join('\n')).not.toContain('Workspace:');
	expect(events.join('\n')).not.toContain('would not be one of its members');
	expect(spawnCalls).toEqual([
		{ args: ['install'], command: 'pnpm', cwd: join(root, 'packages/newapp') },
	]);
});

test('parses both workspace flags and defaults --yes to keeping the app separate', async () => {
	const root = await makeWorkspace();
	const program = new CreateProgram();

	expect(program.validate(['my-app', '--yes'], runtime(root)).workspace).toBeUndefined();
	expect(program.validate(['my-app', '--yes', '--workspace'], runtime(root)).workspace).toBe(
		true,
	);
	expect(program.validate(['my-app', '--yes', '--no-workspace'], runtime(root)).workspace).toBe(
		false,
	);
});

test('documents both workspace flags in the help output and the README', async () => {
	const root = await makeWorkspace();
	const stdoutWrites: string[] = [];

	await new CreateProgram().run(['--help'], runtime(root, { stdoutWrites }));

	expect(stdoutWrites.join('')).toContain(
		'  --workspace       Add the app to the enclosing workspace, if there is one',
	);
	expect(stdoutWrites.join('')).toContain(
		'  --no-workspace    Keep the app separate from the enclosing workspace',
	);

	const readme = await readFile(new URL('../README.md', import.meta.url), 'utf-8');
	expect(readme).toContain('--workspace');
	expect(readme).toContain('--no-workspace');
});

test('installs standalone for every manager when the app matches no member declaration', async () => {
	for (const lane of MANAGER_LANES) {
		const root = await makeWorkspace();
		await writeFiles(root, hostWorkspaceFiles(lane.flavor));

		const { created, spawnCalls, stdoutWrites, targetDir } = await installThroughCli(
			root,
			lane,
			'nested/newapp',
		);

		expect(created.enclosingWorkspace?.flavor, lane.flavor).toBe(lane.flavor);
		expect(created.enclosingWorkspace?.root, lane.flavor).toBe(root);
		expect(created.enclosingWorkspace?.isMember, lane.flavor).toBe(false);
		expect(created.enclosingWorkspace?.memberPath, lane.flavor).toBe('nested/newapp');
		expect(spawnCalls, lane.flavor).toEqual([
			{ args: [...lane.standaloneArgs], command: lane.manager, cwd: targetDir },
		]);
		expect(stdoutWrites.join(''), lane.flavor).toContain(
			`Found a ${lane.manager} workspace at ${root}. nested/newapp is not one of its members`,
		);
		// Berry refuses to install from inside its project unless the directory
		// declares itself a separate project with its own lockfile.
		await expect(exists(join(targetDir, 'yarn.lock'))).resolves.toBe(
			lane.flavor === 'yarn-berry',
		);
		// Nothing was written at or below the enclosing root except in the app.
		await expect(exists(join(root, 'node_modules'))).resolves.toBe(false);
		await expect(exists(join(root, 'yarn.lock'))).resolves.toBe(lane.flavor === 'yarn-berry');
	}
});

test('never hands bun the workspace flag it accepts and ignores', async () => {
	const lane = MANAGER_LANES.find((entry) => entry.flavor === 'bun')!;
	const root = await makeWorkspace();
	await writeFiles(root, hostWorkspaceFiles('bun'));

	const { spawnCalls } = await installThroughCli(root, lane, 'nested/newapp');

	// bun 1.3.14 accepts `--ignore-workspace` without error and hoists to the
	// host root anyway, so passing it would look correct and be wrong.
	expect(spawnCalls[0]?.args).toEqual(['install']);
	expect(spawnCalls[0]?.args).not.toContain('--ignore-workspace');
});

test('stays completely silent when the app already matches a member declaration', async () => {
	for (const lane of MANAGER_LANES) {
		const root = await makeWorkspace();
		await writeFiles(root, hostWorkspaceFiles(lane.flavor, 'packages/newapp'));

		const { created, spawnCalls, stdoutWrites, targetDir } = await installThroughCli(
			root,
			lane,
			'packages/newapp',
		);

		expect(created.enclosingWorkspace?.isMember, lane.flavor).toBe(true);
		expect(spawnCalls, lane.flavor).toEqual([
			{ args: ['install'], command: lane.manager, cwd: targetDir },
		]);
		expect(stdoutWrites.join(''), lane.flavor).not.toContain('Found a');
		await expect(exists(join(targetDir, 'yarn.lock'))).resolves.toBe(false);
	}
});

test('scaffolding the frameless shape installs only the new app', async () => {
	const root = await makeWorkspace();
	const workspaceYaml = [
		'# Do not add ../native-tsrx here.',
		'packages:',
		"    - 'packages/*'",
		'',
	].join('\n');
	await writeFiles(root, {
		'package.json': hostManifest(undefined),
		'packages/one/package.json': `${JSON.stringify({ name: 'one', version: '1.0.0' }, null, 2)}\n`,
		'packages/two/package.json': `${JSON.stringify({ name: 'two', version: '1.0.0' }, null, 2)}\n`,
		'pnpm-workspace.yaml': workspaceYaml,
	});
	const spawnCalls: SpawnCall[] = [];
	const stdoutWrites: string[] = [];

	await new CreateProgram().run(
		['nested/newapp', '--yes', '--agents', 'none', '--no-git'],
		runtime(root, {
			env: { npm_config_user_agent: 'pnpm/10.33.2' },
			spawnCalls,
			stdoutWrites,
		}),
	);

	expect(spawnCalls).toEqual([
		{
			args: ['install', '--ignore-workspace'],
			command: 'pnpm',
			cwd: join(root, 'nested/newapp'),
		},
	]);
	await expect(readFile(join(root, 'pnpm-workspace.yaml'), 'utf-8')).resolves.toBe(workspaceYaml);
	await expect(exists(join(root, 'node_modules'))).resolves.toBe(false);
	await expect(exists(join(root, 'pnpm-lock.yaml'))).resolves.toBe(false);
	await expect(exists(join(root, 'nested/newapp/package.json'))).resolves.toBe(true);
	expect(stdoutWrites.join('')).toContain('is not one of its members');
});

test('a deno-format app installs with deno and is told to run deno task dev', async () => {
	const root = await makeWorkspace();
	const spawnCalls: SpawnCall[] = [];
	const stdoutWrites: string[] = [];

	// The inferred manager is pnpm, but a deno-format app writes no
	// package.json at all, so pnpm would have nothing to install.
	await new CreateProgram().run(
		['deno-app', '--format', 'deno', '--yes', '--agents', 'none', '--no-git'],
		runtime(root, {
			env: { npm_config_user_agent: 'pnpm/10.33.2' },
			spawnCalls,
			stdoutWrites,
		}),
	);

	expect(spawnCalls).toEqual([
		{ args: ['install'], command: 'deno', cwd: join(root, 'deno-app') },
	]);
	expect(stdoutWrites.join('')).toContain('  deno task dev');
	expect(stdoutWrites.join('')).not.toContain('deno dev');
});

test('leaves the install command alone when there is no enclosing workspace', () => {
	const plain = {
		args: ['install'],
		command: 'pnpm',
		note: null,
		prepareFiles: [],
		runIn: 'app',
		skipped: false,
	};

	expect(planInstall({ enclosing: null, manager: 'pnpm', target: 'my-app' })).toEqual(plain);

	// Both flags are inert when nothing encloses the app: there is no workspace
	// to join and none to stay out of.
	for (const workspace of [true, false, undefined]) {
		expect(
			planInstall({ enclosing: null, manager: 'pnpm', target: 'my-app', workspace }),
			`--workspace=${String(workspace)}`,
		).toEqual(plain);
	}
});

test('reports no enclosing workspace when nothing in the tree declares one', async () => {
	const root = await makeWorkspace();
	await writeFiles(root, {
		'nested/package.json': `${JSON.stringify({ name: 'plain' }, null, 2)}\n`,
	});

	for (const manager of ['npm', 'pnpm', 'yarn', 'bun', 'deno'] as const) {
		const found = await detect(root, manager, join(root, 'nested/newapp'));
		expect(insideFixture(found, root), manager).toBe(null);
	}
});

test('walks past a directory gap and keeps the nearest workspace root', async () => {
	const root = await makeWorkspace();
	await writeFiles(root, { 'pnpm-workspace.yaml': "packages:\n  - 'gap/deeper/*'\n" });

	// `gap` and `gap/deeper` hold no manifest at all, and the scan must not
	// stop there: berry was observed claiming a root three levels above a
	// directory with no marker.
	const outer = await detect(root, 'pnpm', join(root, 'gap/deeper/newapp'));
	expect(outer?.root).toBe(root);
	expect(outer?.isMember).toBe(true);

	await writeFiles(root, { 'gap/pnpm-workspace.yaml': "packages:\n  - 'other/*'\n" });
	const nearest = await detect(root, 'pnpm', join(root, 'gap/deeper/newapp'));
	expect(nearest?.root).toBe(join(root, 'gap'));
	expect(nearest?.isMember).toBe(false);
});

test('matches member globs with one-segment, recursive, negated and trailing-slash patterns', async () => {
	const root = await makeWorkspace();
	const isMember = async (path: string) =>
		(await detect(root, 'pnpm', join(root, path)))?.isMember;

	await writeFiles(root, {
		'pnpm-workspace.yaml': [
			'packages:',
			"  - 'packages/*'",
			"  - '!packages/excluded'",
			"  - 'apps/*/'",
			'',
		].join('\n'),
	});

	await expect(isMember('packages/a')).resolves.toBe(true);
	await expect(isMember('packages/deep/b')).resolves.toBe(false);
	await expect(isMember('packages/excluded')).resolves.toBe(false);
	await expect(isMember('apps/c')).resolves.toBe(true);
	await expect(isMember('other')).resolves.toBe(false);

	await writeFiles(root, { 'pnpm-workspace.yaml': "packages:\n  - 'packages/**'\n" });
	await expect(isMember('packages/deep/b')).resolves.toBe(true);
});

test('reads the object form of the workspaces field', async () => {
	const root = await makeWorkspace();
	await writeFiles(root, {
		'package.json': hostManifest({ nohoist: ['**/left-pad'], packages: ['packages/*'] }),
	});

	await expect(
		detect(root, 'npm', join(root, 'packages/newapp')).then((found) => found?.isMember),
	).resolves.toBe(true);
	await expect(
		detect(root, 'npm', join(root, 'nested/newapp')).then((found) => found?.isMember),
	).resolves.toBe(false);
});

test('reads deno workspace members from explicit paths in a commented jsonc config', async () => {
	const root = await makeWorkspace();
	await writeFiles(root, {
		'deno.jsonc':
			'{\n\t// the members of this workspace\n\t"workspace": ["./packages/member"],\n}\n',
	});

	const member = await detect(root, 'deno', join(root, 'packages/member'));
	expect(member?.isMember).toBe(true);
	expect(member?.configFile).toBe(join(root, 'deno.jsonc'));

	const away = await detect(root, 'deno', join(root, 'nested/newapp'));
	expect(away?.isMember).toBe(false);
	expect(away?.uncertain).toBe(false);

	// Deno's own glob resolution inside `workspace` was never confirmed, and
	// "member" is the silent, no-write answer.
	await writeFiles(root, { 'deno.jsonc': '{ "workspace": ["./packages/*"] }\n' });
	const globbed = await detect(root, 'deno', join(root, 'nested/newapp'));
	expect(globbed?.isMember).toBe(true);
	expect(globbed?.uncertain).toBe(true);
});

test('falls to the safe side for member patterns it cannot claim parity on', async () => {
	const root = await makeWorkspace();
	await writeFiles(root, {
		'package.json': hostManifest(['packages/{a,b}']),
		'pnpm-workspace.yaml': "packages:\n  - 'packages/{a,b}'\n",
	});

	// pnpm is the only manager that reinstalls the host from a non-member
	// directory, so an unmatched pattern makes it install on its own.
	const pnpmVerdict = await detect(root, 'pnpm', join(root, 'packages/a'));
	expect(pnpmVerdict?.uncertain).toBe(true);
	expect(pnpmVerdict?.isMember).toBe(false);

	// Every other manager is already correct when it stays silent.
	const npmVerdict = await detect(root, 'npm', join(root, 'packages/a'));
	expect(npmVerdict?.uncertain).toBe(true);
	expect(npmVerdict?.isMember).toBe(true);
});

test('separates yarn berry from yarn classic by the version in the user agent', async () => {
	const root = await makeWorkspace();
	await writeFiles(root, {
		// Classic reads `workspaces` from a package.json; berry's project root
		// is the nearest ancestor holding a yarn.lock.
		'inner/yarn.lock': '',
		'package.json': hostManifest(['packages/*']),
	});
	const appDir = join(root, 'inner/app');

	const classic = await detect(root, 'yarn', appDir, 'yarn/1.22.22 npm/? node/v24.15.0');
	expect(classic?.flavor).toBe('yarn-classic');
	expect(classic?.root).toBe(root);

	const berry = await detect(root, 'yarn', appDir, 'yarn/4.17.1 npm/? node/v24.15.0');
	expect(berry?.flavor).toBe('yarn-berry');
	expect(berry?.root).toBe(join(root, 'inner'));
	expect(berry?.isMember).toBe(false);

	// An unreadable version falls back to the marker files, and berry's marker
	// is the one whose miss is a hard install failure.
	const unknown = await detect(root, 'yarn', appDir, 'yarn/unknown');
	expect(unknown?.flavor).toBe('yarn-berry');
});

function runtime(
	cwd: string,
	overrides: Partial<Pick<ProgramRuntime, 'env' | 'isTTY' | 'prompts'>> & {
		readonly stdoutWrites?: string[];
		readonly stderrWrites?: string[];
		readonly spawnCalls?: SpawnCall[];
	} = {},
): ProgramRuntime {
	return {
		cwd: () => cwd,
		env: overrides.env ?? { npm_config_user_agent: 'pnpm/10.33.2' },
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
				try {
					return await lstat(path);
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
					throw error;
				}
			},
			async mkdir(path, options) {
				await mkdir(path, options);
			},
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
				return await stat(path).catch(() => null);
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
			async writeFile(path, contents) {
				await writeFile(path, contents);
			},
		},
		homeDir: join(cwd, 'fake-home'),
		isTTY: overrides.isTTY ?? false,
		prompts: overrides.prompts,
		stdout: {
			write: (chunk) => {
				overrides.stdoutWrites?.push(String(chunk));
				return true;
			},
		},
		stderr: {
			write: (chunk) => {
				overrides.stderrWrites?.push(String(chunk));
				return true;
			},
		},
		// Records every command the CLI runs so a test can assert the exact
		// argv a package manager would have been handed. `bun install
		// --ignore-workspace` is the one this guards: bun accepts that flag and
		// hoists to the host root anyway, so it would look correct and be wrong.
		spawn: (command, args, options) => {
			overrides.spawnCalls?.push({ args: [...args], command, cwd: options.cwd });
			return { status: 0 };
		},
		async sha256(contents) {
			return createHash('sha256').update(contents).digest('hex');
		},
	};
}
