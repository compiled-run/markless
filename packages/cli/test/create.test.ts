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
	const root = await mkdtemp(join(tmpdir(), 'arcade-router-cli-'));
	cleanupRoots.push(root);
	return root;
};

const exists = async (path: string) =>
	stat(path)
		.then(() => true)
		.catch(() => false);

test('keeps supported project choices and package shape visible', async () => {
	expect(PROJECT_FORMAT_CHOICES.map((choice) => choice.value)).toEqual(['node', 'bun', 'deno']);
	expect(STARTER_CHOICES.map((choice) => choice.value)).toEqual([
		'minimal',
		'app',
		'docs',
		'full-stack',
	]);
	expect(STARTER_CHOICES.find((choice) => choice.value === 'docs')?.hint).toBe('MDX pages');

	const packageJson = JSON.parse(
		await readFile(new URL('../package.json', import.meta.url), 'utf-8'),
	) as {
		bin?: Record<string, string>;
		files: string[];
		name: string;
	};

	expect(packageJson).toMatchObject({
		name: '@arcade/cli',
	});
	expect(packageJson.bin).toBeUndefined();
	expect(packageJson.files).toContain('templates');
	await expect(access(new URL('../src/cli.ts', import.meta.url))).rejects.toThrow();
	await expect(access(new URL('../src/node.ts', import.meta.url))).rejects.toThrow();

	const viteConfig = await readFile(new URL('../../../vite.config.ts', import.meta.url), 'utf-8');
	expect(viteConfig).toContain("'cli/index': './packages/cli/src/index.ts'");
	expect(viteConfig).not.toContain("'cli/cli'");
	expect(viteConfig).not.toContain("'cli/node'");
});

test('keeps CLI templates external and uses shared path and URL helpers', async () => {
	const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf-8');
	const sourceFiles = await readdir(new URL('../src/', import.meta.url));
	const sources = await Promise.all(
		sourceFiles.map((file) => readFile(new URL(`../src/${file}`, import.meta.url), 'utf-8')),
	);
	const sourceText = sources.join('\n');

	expect(source).toContain("from 'pathe'");
	expect(source).toContain("from 'ufo'");
	expect(sourceText).not.toMatch(/from 'node:(child_process|fs|fs\/promises|path|process|url)'/);
	expect(sourceText).not.toMatch(/\bprocess\./);
	expect(sourceText).not.toContain('spawnSync');
	expect(source).not.toContain('function docsHomePage');
	expect(source).not.toContain('function tsconfig');
	expect(source).not.toContain('function packageManifest');
	expect(source).not.toContain('plugins: [arcade(), router()]');
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

test('creates a minimal Arcade Router app with TSRX pages and Nitro-backed deps', async () => {
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
		'@arcade/router': expect.any(String),
		arcade: expect.any(String),
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
	await expect(exists(join(appRoot, 'arcade.config.ts'))).resolves.toBe(false);
	await expect(exists(join(appRoot, 'src/pages'))).resolves.toBe(false);
	await expect(exists(join(appRoot, 'pages/api'))).resolves.toBe(false);
	await expect(readFile(join(appRoot, 'vite.config.ts'), 'utf-8')).resolves.toContain(
		"import { router } from '@arcade/router/vite';",
	);
	expect(viteConfig).toContain('plugins: [arcade(), router()]');
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
		'@arcade/router': 'npm:@arcade/router',
		arcade: 'npm:arcade',
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
	expect(indexMdx).toContain('# Arcade Router Docs');
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

function runtime(cwd: string): ProgramRuntime {
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
		isTTY: false,
		stdout: { write: () => true },
		stderr: { write: () => true },
		spawn: () => ({ status: 0 }),
	};
}
