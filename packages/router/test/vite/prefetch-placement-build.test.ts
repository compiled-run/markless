import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { afterAll, expect, test } from 'vitest';
import { startBuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { buildFixture } from '../support/fixture-build.ts';

// prefetch={false} works on an <a> and on a component that spreads its props onto
// one; on a component that spreads onto anything else the build says so.
const packagesRoot = resolve(import.meta.dirname, '../../..');
const cleanups: Array<() => Promise<void> | void> = [];
afterAll(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function app(misplacedPage: boolean) {
	const root = await mkdtemp(join(tmpdir(), 'markless-prefetch-placement-'));
	cleanups.push(() => rm(root, { recursive: true, force: true }));
	await cp(resolve(import.meta.dirname, '../fixtures/prefetch-placement-app'), root, { recursive: true });
	if (misplacedPage) await cp(join(root, 'misplaced.tsrx'), join(root, 'pages/misplaced.tsrx'));
	await rm(join(root, 'misplaced.tsrx'));
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	return root;
}

test('prefetch={false} on an anchor and on a component that forwards to one reaches the anchor', async () => {
	const root = await app(false);
	await buildFixture({ root });
	const server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	cleanups.push(() => server.close());
	const html = await (await fetch(new URL('/', server.origin))).text();
	expect(html).toMatch(/<a [^>]*data-markless-router-prefetch="none"[^>]*data-plain[^>]*>Plain<\/a>/);
	expect(html).toMatch(
		/<a [^>]*data-markless-router-prefetch="none"[^>]*data-part="nav-link"[^>]*>Forwarded<\/a>|<a [^>]*data-part="nav-link"[^>]*data-markless-router-prefetch="none"[^>]*>Forwarded<\/a>/,
	);
	expect(html).not.toMatch(/\sprefetch=/);
}, 180_000);

test('prefetch={false} on a component that spreads onto a button fails the build', async () => {
	const root = await app(true);
	await expect(buildFixture({ root })).rejects.toThrow(/MARKLESS_ELEMENT_ONLY_ATTRIBUTE_MISPLACED/);
}, 180_000);
