import { access, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { afterEach, expect, test } from 'vitest';
import {
	CreateProgram,
	PROJECT_FORMAT_CHOICES,
	STARTER_CHOICES,
	type ProgramRuntime,
} from '../src/index.ts';

const cleanupRoots: string[] = [];

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
		name: '@markless/cli',
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
	expect(viteConfig).toContain("'cli/index': './packages/cli/src/index.ts'");
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

test('node executable adapter owns host APIs outside the reusable create program', async () => {
	const nodeAdapter = await readFile(new URL('../src/node.ts', import.meta.url), 'utf-8');
	const programSource = await readFile(new URL('../src/index.ts', import.meta.url), 'utf-8');

	expect(nodeAdapter).toContain('process.argv.slice(2)');
	expect(nodeAdapter).toContain('new CreateProgram().run');
	expect(nodeAdapter).toContain("from '@clack/prompts'");
	expect(nodeAdapter).toContain('select(');
	expect(nodeAdapter).toContain('text(');
	expect(nodeAdapter).toContain('note(');
	expect(nodeAdapter).toContain('outro(');
	expect(nodeAdapter).toContain('isCancel(');
	expect(nodeAdapter).toContain("from 'node:child_process'");
	expect(nodeAdapter).toContain("from 'node:fs/promises'");
	expect(nodeAdapter).not.toContain("from 'node:readline");
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

	expect(packageJson.scripts).toMatchObject({
		build: 'vp build',
		check: 'vp check',
		dev: 'vp dev',
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
		typescript: expect.any(String),
		vite: expect.any(String),
	});
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
	await expect(readFile(join(appRoot, 'tsconfig.json'), 'utf-8')).resolves.not.toContain('tsx');
	await expect(exists(join(appRoot, 'pages/index.tsx'))).resolves.toBe(false);
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

			await expect(exists(join(appRoot, 'pages/404.tsrx'))).resolves.toBe(true);
			await expect(exists(join(appRoot, 'pages/500.tsrx'))).resolves.toBe(true);
			await expect(exists(join(appRoot, '404.tsrx'))).resolves.toBe(false);
			await expect(exists(join(appRoot, '500.tsrx'))).resolves.toBe(false);
			expect(tsconfigJson).toContain('"pages"');
			expect(tsconfigJson).not.toContain('"404.tsrx"');
			expect(tsconfigJson).not.toContain('"500.tsrx"');
		}),
	);
});

test('generates Deno format imports with Nitro available', async () => {
	const root = await makeWorkspace();
	const program = new CreateProgram();

	await program.run(['deno-app', '--format', 'deno', '--no-install', '--no-git'], runtime(root));

	const denoJson = JSON.parse(await readFile(join(root, 'deno-app/deno.json'), 'utf-8')) as {
		imports: Record<string, string>;
		nodeModulesDir?: string;
	};

	expect(denoJson.nodeModulesDir).toBe('auto');
	expect(denoJson.imports).toMatchObject({
		'@markless/core': 'npm:@markless/core',
		'@markless/router': 'npm:@markless/router',
		nitro: 'npm:nitro@3.0.260429-beta',
	});
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

test('rejects --yes without a positional target', async () => {
	const root = await makeWorkspace();
	const program = new CreateProgram();

	expect(() => program.validate(['--yes'], runtime(root))).toThrow(
		'Project name is required when running non-interactively.',
	);
});

function runtime(
	cwd: string,
	overrides: Partial<Pick<ProgramRuntime, 'isTTY' | 'prompts'>> & {
		readonly stdoutWrites?: string[];
		readonly stderrWrites?: string[];
	} = {},
): ProgramRuntime {
	return {
		cwd: () => cwd,
		env: { npm_config_user_agent: 'pnpm/10.33.2' },
		fs: {
			async mkdir(path, options) {
				await mkdir(path, options);
			},
			async readDirectory(path) {
				const entries = await readdir(path, { withFileTypes: true });
				return entries.flatMap((entry) => {
					if (entry.isDirectory())
						return [{ name: entry.name, kind: 'directory' as const }];
					if (entry.isFile()) return [{ name: entry.name, kind: 'file' as const }];
					return [];
				});
			},
			readFile(path) {
				return readFile(path, 'utf-8');
			},
			async stat(path) {
				return await stat(path).catch(() => null);
			},
			async writeFile(path, contents) {
				await writeFile(path, contents);
			},
		},
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
		spawn: () => ({ status: 0 }),
	};
}
