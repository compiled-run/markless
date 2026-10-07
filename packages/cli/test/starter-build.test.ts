import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { join, resolve } from 'pathe';
import { createBuilder } from 'vite';
import { afterEach, expect, test } from 'vitest';
import { CreateProgram, STARTER_CHOICES, type Starter } from '../src/index.ts';
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

async function scaffold(starter: Starter): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), `markless-starter-${starter}-`));
	cleanups.push(() => rm(root, { force: true, recursive: true }));
	const writable = { write: () => undefined };
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

// The server binds a port of its own choosing and names it on stdout once it is listening;
// srvx stays quiet while `TEST` is set, so the child runs without it.
async function serve(appRoot: string): Promise<string> {
	const { TEST: _test, ...env } = process.env;
	const server = spawn(process.execPath, [join(appRoot, '.output/server/index.mjs')], {
		cwd: appRoot,
		env: { ...env, PORT: '0' },
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	cleanups.push(() => void server.kill());
	let output = '';
	return new Promise((resolveOrigin, reject) => {
		server.stdout.on('data', (chunk: Buffer) => {
			output += chunk.toString();
			const listening = /Listening on:\s*(\S+)/.exec(output);
			if (listening) resolveOrigin(new URL(listening[1]!).origin);
		});
		server.stderr.on('data', (chunk: Buffer) => {
			output += chunk.toString();
		});
		server.once('error', reject);
		server.once('exit', (code, signal) =>
			reject(new Error(`built server exited (${code ?? signal}) before listening:\n${output}`)),
		);
	});
}

test('the starter list this build covers is the list the CLI offers', () => {
	expect(STARTER_CHOICES.map((choice) => choice.value).toSorted()).toEqual(
		Object.keys(servedPages).toSorted(),
	);
});

test.each(STARTER_CHOICES.map((choice) => choice.value))(
	'a freshly scaffolded %s starter builds with its own vite config and serves its pages',
	async (starter) => {
		const appRoot = await scaffold(starter);
		await check(appRoot);
		const builder = await createBuilder({
			root: appRoot,
			configFile: join(appRoot, 'vite.config.ts'),
			logLevel: 'silent',
		});
		await builder.buildApp();
		await check(appRoot);

		const origin = await serve(appRoot);
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
