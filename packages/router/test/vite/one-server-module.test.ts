import { cp, mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
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

const page = async (origin: string) => (await fetch(`${origin}/`)).text();

async function expectOneCounter(origin: string): Promise<void> {
	expect(await page(origin)).toContain('<p data-counts="">0/1</p>');
	const bumped = await fetch(`${origin}/api/bump`, { method: 'POST' });
	expect(await bumped.json()).toEqual({ count: 1 });
	expect(await (await fetch(`${origin}/api/count`)).json()).toEqual({
		count: 1,
		pageRequests: 1,
	});
	expect(await page(origin)).toContain('<p data-counts="">1/2</p>');
}

describe('one server module instance per server', () => {
	test('production build: the page render sees what an api route wrote', async () => {
		const root = await app();
		await buildFixture({ root });
		const server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
			env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
		});
		try {
			await expectOneCounter(server.origin);
		} finally {
			server.close();
		}
	});

	test('dev server: the page render sees what an api route wrote', async () => {
		const root = await app();
		const server = await startFixtureDev(root);
		try {
			await expectOneCounter(server.origin);
		} finally {
			await server.close();
		}
	});
});
