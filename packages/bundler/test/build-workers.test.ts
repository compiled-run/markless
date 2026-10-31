import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'pathe';
import { afterAll, afterEach, expect, test } from 'vitest';
import {
	clearCompileCache,
	compileTsrxModule,
	useCompileRunner,
	usePersistentCompileStore,
} from '@markless/compiler';
import {
	compileStoreEntry,
	compilerFingerprint,
	createPersistentCompileCache,
} from '../src/compile-store.ts';
import { createCompileWorkerPool } from '../src/build-workers.ts';

const scratch = mkdtempSync(join(tmpdir(), 'markless-build-workers-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
afterEach(() => {
	useCompileRunner(undefined);
	usePersistentCompileStore(undefined);
	clearCompileCache();
});

const counter = (name: string) =>
	[
		"import { state } from '@markless/core';",
		`export default function ${name}() @{`,
		'\tlet count = state(0);',
		'\t<button onClick={() => count++}>{count}</button>',
		'}',
	].join('\n');
const input = (name: string) => ({
	filename: `/app/${name}.tsrx`,
	moduleId: `${name}.tsrx`,
	source: counter(name),
	symbols: [],
});

async function onlinePool(options: Parameters<typeof createCompileWorkerPool>[0]) {
	const pool = createCompileWorkerPool(options);
	// The first request boots a worker and compiles on this thread until one is online.
	pool.run(input('Boot'), 'boot');
	for (let turn = 0; turn < 500; turn++) {
		const probe = pool.run(input('Probe'), `probe-${turn}`);
		if (probe) {
			await probe;
			return pool;
		}
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error('no compile worker came online');
}

test('a compile on a worker thread equals the same compile on this thread', async () => {
	const names = ['Alpha', 'Beta', 'Gamma', 'Delta'];
	const here = await Promise.all(names.map((name) => compileTsrxModule(input(name))));
	clearCompileCache();
	const pool = await onlinePool({ size: 2 });
	let ran = 0;
	useCompileRunner((compileInput, key) => {
		ran++;
		return pool.run(compileInput, key);
	});
	const elsewhere = await Promise.all(names.map((name) => compileTsrxModule(input(name))));
	await pool.close();
	expect(ran).toBe(names.length);
	expect(elsewhere).toEqual(here);
});

test('a worker writes the result to the store, and a later build reads it back', async () => {
	const directory = join(scratch, 'store');
	const fingerprint = compilerFingerprint();
	const cache = createPersistentCompileCache({ directory, fingerprint });
	usePersistentCompileStore(cache);
	const pool = await onlinePool({ size: 1, store: { cache, directory, fingerprint } });
	useCompileRunner(pool.run);
	const compiled = await compileTsrxModule(input('Stored'));
	await pool.close();
	await cache.flush();
	useCompileRunner(undefined);
	expect(
		readdirSync(directory, { recursive: true }).some((name) => String(name).endsWith('.bin')),
	).toBe(true);

	clearCompileCache();
	const later = createPersistentCompileCache({ directory, fingerprint });
	usePersistentCompileStore(later);
	expect(await compileTsrxModule(input('Stored'))).toEqual(compiled);
});

test('closing a pool waits for compiles it handed a worker but nobody awaited', async () => {
	const directory = join(scratch, 'unawaited');
	const fingerprint = compilerFingerprint();
	const cache = createPersistentCompileCache({ directory, fingerprint });
	await (await onlinePool({ size: 1 })).close();
	const pool = createCompileWorkerPool({ size: 1, store: { cache, directory, fingerprint } });
	const names = ['Left', 'Right', 'Up', 'Down'];
	for (const name of names) void pool.run(input(name), name);
	await pool.close();
	const written = readdirSync(directory, { recursive: true }).filter((name) =>
		String(name).endsWith('.bin'),
	);
	for (const name of names)
		expect(written).toContain(
			relative(directory, compileStoreEntry(directory, fingerprint, input(name).source, name).path),
		);
});

test('a compile a runner hands back is compiled here, once', async () => {
	const here = await compileTsrxModule(input('HandedBack'));
	clearCompileCache();
	let asked = 0;
	useCompileRunner(() => {
		asked++;
		return Promise.resolve(undefined);
	});
	const [left, right] = await Promise.all([
		compileTsrxModule(input('HandedBack')),
		compileTsrxModule(input('HandedBack')),
	]);
	expect(asked).toBe(1);
	expect(right).toBe(left);
	expect(left).toEqual(here);
});
