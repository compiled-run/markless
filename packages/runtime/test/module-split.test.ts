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
	const graphSource = await readSource('../src/graph.ts');

	expect(typeof createRuntimeGraph).toBe('function');
	expect(manifest.exports).toEqual({
		'.': './src/index.ts',
		'./graph': './src/graph.ts',
		'./graph-reconcile': './src/graph-reconcile.ts',
	});
	expect(indexSource).toBe("export * from './graph.ts';\n");
	expect(graphSource).toContain("from './graph-core.ts'");
	expect(graphSource).toContain("from './graph-collections.ts'");
	expect(graphSource).toContain("from './graph-computed.ts'");
	expect(graphSource).toContain("from './graph-async.ts'");
	expect(graphSource).toContain("from './graph-scheduler.ts'");
	expect(graphSource).toContain("from './graph-shared.ts'");
});

// Derived reconciliation is an installable plane, and an app that never
// installs it must not ship the diff. That holds only while the core graph
// modules name the plane's types and never import its runtime, because a single
// value import would make the module statically reachable from every graph.
test('the core graph modules reference the reconcile plane by type only', async () => {
	for (const file of [
		'../src/index.ts',
		'../src/graph.ts',
		'../src/graph-computed.ts',
		'../src/graph-async.ts',
	]) {
		const code = (await readSource(file))
			.split('\n')
			.filter((line) => !line.trimStart().startsWith('//'))
			.join('\n');
		for (const statement of code.split(';')) {
			if (!statement.includes("'./graph-reconcile.ts'")) continue;
			expect(`${file}: ${statement.trim()}`).toMatch(/: (import|export) type /);
		}
	}
});
