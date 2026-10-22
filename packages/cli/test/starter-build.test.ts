import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { join, resolve } from 'pathe';
import { createServer } from 'vite';
import { afterEach, expect, test } from 'vitest';
import { buildWarnings } from '../../../scripts/ci/build-warnings.mjs';
import { startBuiltServer } from '../../../scripts/test-utils/built-server.ts';
import { CreateProgram, STARTER_CHOICES, STARTER_DEV_PORTS, type Starter } from '../src/index.ts';
import { createNodeRuntime } from '../src/node-runtime.ts';

const repoRoot = resolve(import.meta.dirname, '../../..');
const cleanups: Array<() => Promise<void> | void> = [];
const execFileAsync = promisify(execFile);

afterEach(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

// Stands in for the install step: the scaffold's dependencies resolve to this checkout.
const linkedDependencies = [
	['@markless/core', join(repoRoot, 'packages/core')],
	['@markless/router', join(repoRoot, 'packages/router')],
	['vite-plus', join(repoRoot, 'node_modules/vite-plus')],
	['vite', join(repoRoot, 'node_modules/vite')],
	['nitro', join(repoRoot, 'packages/router/node_modules/nitro')],
] as const;

const servedPages: Record<Starter, ReadonlyArray<readonly [path: string, text: string]>> = {
	minimal: [['/', '<body']],
	app: [['/', '<body']],
	'full-stack': [
		['/', '<body'],
		['/api/health', 'ok'],
	],
	docs: [
		['/', '<h1>Markless Router Docs</h1>'],
		['/docs', '<h1>Getting Started</h1>'],
		['/docs/getting-started', '<nav aria-label="Docs">'],
		[
			'/docs/getting-started',
			'<h1>Guide</h1><p>This catch-all MDX route renders its markdown inside a TSRX layout component.</p>',
		],
	],
};

async function scaffold(starter: Starter, printed: string[] = []): Promise<string> {
	// Nitro's dev worker fails to import its runner from a symlinked path, as macOS's tmpdir is.
	const root = await mkdtemp(join(await realpath(tmpdir()), `markless-starter-${starter}-`));
	cleanups.push(() => rm(root, { force: true, recursive: true }));
	const writable = { write: (chunk: string) => void printed.push(chunk) };
	await new CreateProgram().run(
		['app', '--starter', starter, '--no-install', '--no-git'],
		createNodeRuntime({
			cwd: root,
			env: { npm_config_user_agent: 'pnpm/10.33.2' },
			isTTY: false,
			stdout: writable,
			stderr: writable,
		}),
	);
	const appRoot = join(root, 'app');
	for (const [name, target] of linkedDependencies) {
		const link = join(appRoot, 'node_modules', name);
		await mkdir(resolve(link, '..'), { recursive: true });
		await symlink(target, link, 'dir');
	}
	return appRoot;
}

function startDevServer(appRoot: string) {
	return createServer({
		root: appRoot,
		configFile: join(appRoot, 'vite.config.ts'),
		logLevel: 'silent',
	});
}

// The scaffold's own `check` script: formatting under its vite config's fmt settings, then lint.
async function check(appRoot: string): Promise<string> {
	const result = await execFileAsync(join(repoRoot, 'node_modules/.bin/vp'), ['check'], {
		cwd: appRoot,
		env: { ...process.env, NO_COLOR: '1' },
	}).catch((error: { stdout?: string; stderr?: string }) => {
		throw new Error(`vp check failed:\n${error.stdout ?? ''}${error.stderr ?? ''}`);
	});
	return result.stdout + result.stderr;
}

// The scaffold's own `build` script; returns the warning lines it printed.
async function build(appRoot: string): Promise<string[]> {
	const bin = join(repoRoot, 'node_modules/.bin');
	const result = await execFileAsync(join(bin, 'vp'), ['run', 'build'], {
		cwd: appRoot,
		env: { ...process.env, NO_COLOR: '1', PATH: `${bin}:${process.env.PATH}` },
		maxBuffer: 64 * 1024 * 1024,
	}).catch((error: { stdout?: string; stderr?: string }) => {
		throw new Error(`vp run build failed:\n${error.stdout ?? ''}${error.stderr ?? ''}`);
	});
	return buildWarnings(result.stderr);
}

test('the starter list this build covers is the list the CLI offers', () => {
	expect(STARTER_CHOICES.map((choice) => choice.value).toSorted()).toEqual(
		Object.keys(servedPages).toSorted(),
	);
});

test.each(STARTER_CHOICES.map((choice) => choice.value))(
	'the next steps for a %s starter print the port its dev server resolves to',
	async (starter) => {
		const printed: string[] = [];
		const appRoot = await scaffold(starter, printed);
		const { PORT: _port, ...env } = process.env;
		const savedEnv = process.env;
		process.env = env;
		cleanups.push(() => {
			process.env = savedEnv;
		});
		const server = await startDevServer(appRoot);
		cleanups.push(() => server.close());
		expect(server.config.server.port).toBe(STARTER_DEV_PORTS[starter]);
		expect(printed.join('')).toContain(`http://localhost:${server.config.server.port}\n`);
	},
	60_000,
);

// Nitro starts its dev worker while the config resolves; only closing the server stops it.
test('a closed starter dev server leaves nothing writing into its app', async () => {
	const appRoot = await scaffold('minimal');
	const server = await startDevServer(appRoot);
	await server.close();
	const nitroDir = join(appRoot, 'node_modules/.nitro');
	await rm(nitroDir, { force: true, recursive: true });
	await new Promise((done) => setTimeout(done, 500));
	expect(existsSync(nitroDir)).toBe(false);
}, 60_000);

test.each(STARTER_CHOICES.map((choice) => choice.value))(
	'a freshly scaffolded %s starter builds with its own vite config and serves its pages',
	async (starter) => {
		const appRoot = await scaffold(starter);
		await check(appRoot);
		expect(await build(appRoot)).toEqual([]);
		await check(appRoot);

		const server = await startBuiltServer(join(appRoot, '.output/server/index.mjs'), {
			cwd: appRoot,
		});
		cleanups.push(() => server.close());
		const { origin } = server;
		for (const [path, text] of servedPages[starter]) {
			const response = await fetch(new URL(path, origin));
			expect(response.status, path).toBe(200);
			const html = await response.text();
			expect(html, path).toContain(text);
			if (response.headers.get('content-type')?.startsWith('text/html')) {
				expect(html, path).toContain('<title>app</title>');
			}
		}
	},
	180_000,
);
