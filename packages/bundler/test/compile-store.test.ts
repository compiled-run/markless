import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { afterAll, expect, test } from 'vitest';
import { clearCompileCache } from '../../compiler/src/compile-cache.ts';
import { compileTsrxModule, usePersistentCompileStore } from '@markless/compiler';
import { compilerFingerprint, createPersistentCompileCache } from '../src/compile-store.ts';

const scratch = mkdtempSync(join(tmpdir(), 'markless-compile-store-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const source = [
	"import { state } from '@markless/core';",
	'export default function Counter() @{',
	'\tlet count = state(0);',
	'\t<button onClick={() => count++}>{count}</button>',
	'}',
].join('\n');
const input = { filename: '/app/Counter.tsrx', moduleId: 'Counter.tsrx', source, symbols: [] };

function files(directory: string): string[] {
	return readdirSync(directory, { recursive: true }).filter((name) =>
		String(name).endsWith('.bin'),
	) as string[];
}

test('a later process reads a stored compile back instead of compiling, and gets the same result', async () => {
	const directory = join(scratch, 'round-trip');
	const fingerprint = compilerFingerprint();
	clearCompileCache();
	const first = createPersistentCompileCache({ directory, fingerprint });
	usePersistentCompileStore(first);
	const compiled = await compileTsrxModule(input);
	await first.flush();
	usePersistentCompileStore(undefined);
	expect(files(directory)).toHaveLength(1);

	clearCompileCache();
	const second = createPersistentCompileCache({ directory, fingerprint });
	let reads = 0;
	usePersistentCompileStore({
		read: (text, key) => {
			const stored = second.read(text, key);
			if (stored) reads++;
			return stored;
		},
		write: second.write,
	});
	const restored = await compileTsrxModule(input);
	usePersistentCompileStore(undefined);
	clearCompileCache();
	expect(reads).toBe(1);
	expect(JSON.stringify(restored)).toBe(JSON.stringify(compiled));
});

test('another compiler build, an edited source or another input is a different entry', () => {
	const directory = join(scratch, 'keys');
	const store = createPersistentCompileCache({ directory, fingerprint: 'compiler-a' });
	const result = { marker: 1 } as never;
	store.write(source, 'key', result);
	return store.flush().then(() => {
		expect(store.read(source, 'key')).toEqual(result);
		expect(store.read(`${source}\n`, 'key')).toBeUndefined();
		expect(store.read(source, 'other-key')).toBeUndefined();
		expect(
			createPersistentCompileCache({ directory, fingerprint: 'compiler-b' }).read(
				source,
				'key',
			),
		).toBeUndefined();
	});
});

test('a damaged entry compiles again instead of failing the build', async () => {
	const directory = join(scratch, 'damaged');
	const store = createPersistentCompileCache({ directory, fingerprint: 'f' });
	store.write(source, 'key', { marker: 1 } as never);
	await store.flush();
	for (const name of files(directory))
		writeFileSync(join(directory, name), 'not a stored result');
	expect(
		createPersistentCompileCache({ directory, fingerprint: 'f' }).read(source, 'key'),
	).toBeUndefined();
});

test('past its size budget the store drops results this process did not use', async () => {
	const directory = join(scratch, 'trim');
	const earlier = createPersistentCompileCache({ directory, fingerprint: 'f' });
	for (let index = 0; index < 20; index++)
		earlier.write(`old ${index}`, 'key', { text: 'x'.repeat(4_000 + index) } as never);
	await earlier.flush();
	const later = createPersistentCompileCache({ directory, fingerprint: 'f', maxBytes: 1 });
	later.write('kept', 'key', { text: 'kept' } as never);
	await later.flush();
	expect(files(directory)).toHaveLength(1);
	expect(later.read('kept', 'key')).toEqual({ text: 'kept' });
});

test('the fingerprint is stable for one compiler build', () => {
	expect(compilerFingerprint()).toBe(compilerFingerprint());
});
