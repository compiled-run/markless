import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { afterAll, describe, expect, test, vi } from 'vitest';
import { startBuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { buildFixture } from '../support/fixture-build.ts';
import { startFixtureDev } from '../support/fixture-dev.ts';

// server/counter.ts keeps two counts in module variables: api/bump.post.ts raises one, middleware/pages.ts the other, and
// the page renders both on the server, so it sees each raise only when all three share one instance of the module.

vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
const roots: string[] = [];

async function app(): Promise<string> {
	const root = await realpath(await mkdtemp(join(tmpdir(), 'markless-one-server-module-')));
	roots.push(root);
	await cp(resolve(import.meta.dirname, '../fixtures/server-module-app'), root, {
		recursive: true,
	});
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await symlink(
		resolve(packagesRoot, 'router/node_modules/nitro'),
		join(root, 'node_modules/nitro'),
		'dir',
	);
	return root;
}

afterAll(async () => {
	await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

const text = async (origin: string, path: string) => (await fetch(`${origin}${path}`)).text();
const json = async (origin: string, path: string, init?: RequestInit) =>
	(await fetch(`${origin}${path}`, init)).json();

async function expectOneCounter(origin: string, mode: 'dev' | 'prod'): Promise<void> {
	expect(await text(origin, '/')).toContain('<p data-counts="">0/1</p>');
	expect(await json(origin, '/api/bump', { method: 'POST' })).toEqual({ count: 1 });
	expect(await json(origin, '/api/count')).toEqual({ count: 1, pageRequests: 1, afterNext: 1 });
	expect(await text(origin, '/')).toContain('<p data-counts="">1/2</p>');
	// The server half of pages/total.tsrx imports api/total.ts itself; the page and the route still share one copy.
	expect(await text(origin, '/total')).toContain('<p data-total="">total 1</p>');
	expect(await json(origin, '/api/total')).toEqual({ total: 'total 1' });
	expect(await json(origin, '/api/mode')).toEqual({ mode });
}

describe('one server module instance per server', () => {
	test('production build: the page render sees what an api route wrote', async () => {
		const root = await app();
		await buildFixture({ root });
		const server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
			env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
		});
		try {
			await expectOneCounter(server.origin, 'prod');
		} finally {
			server.close();
		}
	});

	test('dev server: the page render sees what an api route wrote', async () => {
		const root = await app();
		const server = await startFixtureDev(root);
		try {
			await expectOneCounter(server.origin, 'dev');
		} finally {
			await server.close();
		}
	});

	test('dev server: an edited api route answers with its new code and keeps the shared count', async () => {
		const root = await app();
		const server = await startFixtureDev(root, { watch: true });
		try {
			const { origin } = server;
			expect(await json(origin, '/api/bump', { method: 'POST' })).toEqual({ count: 1 });
			const route = join(root, 'api/bump.post.ts');
			await writeFile(
				route,
				(await readFile(route, 'utf8')).replace(
					'{ count: bumpCount() }',
					'{ count: bumpCount(), edited: true }',
				),
			);
			await expect
				.poll(async () => json(origin, '/api/bump', { method: 'POST' }), {
					timeout: 20_000,
				})
				.toMatchObject({ edited: true });
			const { count } = (await json(origin, '/api/count')) as { count: number };
			expect(count).toBeGreaterThan(1);
			expect(await text(origin, '/')).toContain(`<p data-counts="">${count}/`);
		} finally {
			await server.close();
		}
	});
});
