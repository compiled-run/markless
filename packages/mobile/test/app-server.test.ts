import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect, test } from 'vitest';
import { startBuiltServer } from '../../../scripts/test-utils/built-server.ts';
import { appsDir } from '../apps/measure.ts';
import { takeBuildSlot } from '../../router/test/support/build-slots.ts';
import { buildAppServer } from '../src/harness/app-server.ts';

const cleanups: Array<() => Promise<void>> = [];
afterAll(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

test("an app rung's web build serves its api/ routes, which the runner holds at the origin its app.json names", async () => {
	const out = await mkdtemp(join(tmpdir(), 'markless-app-server-'));
	cleanups.push(() => rm(out, { recursive: true, force: true }));
	const release = await takeBuildSlot();
	try {
		await buildAppServer(join(appsDir, 'shop'), out);
	} finally {
		await release();
	}
	const server = await startBuiltServer(join(out, 'server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	cleanups.push(() => server.close());
	const answer = await fetch(new URL('/api/products', server.origin));
	expect(answer.status).toBe(200);
	expect(JSON.stringify(await answer.json())).toContain('Desk lamp');
}, 180_000);
