import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { createRuntimeGraph } from '../src/graph.ts';

function readSource(relativePath: string): Promise<string> {
	return readFile(new URL(relativePath, import.meta.url), 'utf8');
}

async function readJson<T>(relativePath: string): Promise<T> {
	return JSON.parse(await readSource(relativePath)) as T;
}

test('runtime package exposes only host-agnostic graph modules', async () => {
	const manifest = await readJson<{ exports: Record<string, string> }>('../package.json');
	const indexSource = await readSource('../src/index.ts');

	expect(typeof createRuntimeGraph).toBe('function');
	expect(manifest.exports).toEqual({
		'.': './src/index.ts',
		'./graph': './src/graph.ts',
	});
	expect(indexSource).toBe("export * from './graph.ts';\n");
});
