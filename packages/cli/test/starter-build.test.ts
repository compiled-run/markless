import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { createBuilder } from 'vite';
import { afterEach, expect, test } from 'vitest';
import { CreateProgram, STARTER_CHOICES, type Starter } from '../src/index.ts';
import { createNodeRuntime } from '../src/node-runtime.ts';

const repoRoot = resolve(import.meta.dirname, '../../..');
const cleanups: Array<() => Promise<void> | void> = [];

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

async function freePort(): Promise<number> {
	return new Promise((resolvePort, reject) => {
		const server = createServer();
		server.once('error', reject);
		server.listen(0, () => {
			const address = server.address();
			server.close(() =>
				typeof address === 'object' && address
					? resolvePort(address.port)
					: reject(new Error('no port')),
			);
		});
	});
}

async function serve(appRoot: string): Promise<string> {
	const port = await freePort();
	const server = spawn(process.execPath, [join(appRoot, '.output/server/index.mjs')], {
		cwd: appRoot,
		env: { ...process.env, PORT: String(port) },
		stdio: 'ignore',
	});
	cleanups.push(() => void server.kill());
	const origin = `http://localhost:${port}`;
	for (let attempt = 0; attempt < 100; attempt++) {
		if (server.exitCode !== null) throw new Error(`built server exited with ${server.exitCode}`);
		const reached = await fetch(origin).then(
			() => true,
			() => false,
		);
		if (reached) return origin;
		await new Promise((wait) => setTimeout(wait, 100));
	}
	throw new Error('built server never answered');
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
		const builder = await createBuilder({
			root: appRoot,
			configFile: join(appRoot, 'vite.config.ts'),
			logLevel: 'silent',
		});
		await builder.buildApp();

		const origin = await serve(appRoot);
		for (const [path, text] of servedPages[starter]) {
			const response = await fetch(new URL(path, origin));
			expect(response.status, path).toBe(200);
			expect(await response.text(), path).toContain(text);
		}
	},
	180_000,
);
