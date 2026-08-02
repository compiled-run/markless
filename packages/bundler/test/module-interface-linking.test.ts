import { expect, test, vi } from 'vitest';
import { marklessServer, transformTsrxModule } from '../src/rolldown.ts';
import { callBuildStart, callTransform } from './helpers.ts';

const helperFilename = '/workspace/app/src/counter.tsrx';
const importerFilename = '/workspace/app/src/App.tsrx';
const helperSource = `
import { state } from '@markless/core';
export function counter() { const value = state(0); return value; }
`;
const importerSource = `
import { counter } from './counter.tsrx';
export function App() @{ const count = counter(); <button onClick={() => count++}>{count}</button> }
`;

test('transformTsrxModule compiles an importer with its child module graph interface', async () => {
	const child = await transformTsrxModule({
		filename: helperFilename,
		source: helperSource,
		environment: 'server',
	});
	const importer = await transformTsrxModule({
		filename: importerFilename,
		source: importerSource,
		environment: 'server',
		importedModuleInterfaces: {
			'./counter.tsrx': child.moduleGraphInterface,
		},
	});

	expect(importer.code).toContain('state:App.count.counter.value');
});

test('build transforms link a previously compiled child interface into its importer', async () => {
	const plugin = marklessServer();
	const resolve = vi.fn(async (specifier: string) =>
		specifier === './counter.tsrx' ? { id: helperFilename } : null,
	);
	callBuildStart(plugin, { cwd: '/workspace/app' });
	await callTransform(plugin, helperSource, helperFilename, { resolve });

	const importer = (await callTransform(plugin, importerSource, importerFilename, {
		resolve,
	})) as { code: string };

	expect(importer.code).toContain('state:App.count.counter.value');
	expect(resolve).toHaveBeenCalledWith('./counter.tsrx', importerFilename, {
		skipSelf: true,
	});
});

test('dev transforms force a child artifact before linking its interface', async () => {
	let plugin: ReturnType<typeof marklessServer>;
	const resolve = vi.fn(async (specifier: string) =>
		specifier === './counter.tsrx' ? { id: helperFilename } : null,
	);
	const transformRequest = vi.fn(async (url: string) =>
		callTransform(plugin, helperSource, url, { resolve }),
	);
	plugin = marklessServer({
		dev: true,
		devServer: { transformRequest },
	});
	callBuildStart(plugin, { cwd: '/workspace/app' });

	const importer = (await callTransform(plugin, importerSource, importerFilename, {
		resolve,
	})) as { code: string };

	expect(transformRequest).toHaveBeenCalledExactlyOnceWith(helperFilename, 'server');
	expect(importer.code).toContain('state:App.count.counter.value');
});

test('a missing child interface degrades to the existing absent-interface behavior', async () => {
	const source = `
import { formatLabel } from './missing.tsrx';
export function App() @{ <p>Ready</p> }
`;
	const plugin = marklessServer();
	const load = vi.fn(async () => undefined);
	callBuildStart(plugin, { cwd: '/workspace/app' });

	const result = (await callTransform(plugin, source, importerFilename, {
		load,
		resolve: vi.fn(async () => ({ id: '/workspace/app/src/missing.tsrx' })),
	})) as { code: string };

	expect(load).toHaveBeenCalledExactlyOnceWith({ id: '/workspace/app/src/missing.tsrx' });
	expect(result.code).toContain('"statics": ["<p>Ready</p>"]');
});

test('cyclic tsrx imports use available artifacts without recursively forcing parents', async () => {
	const childFilename = '/workspace/app/src/Child.tsrx';
	const parentSource = `import { Child } from './Child.tsrx'; export function App() @{ <main>Parent</main> }`;
	const childSource = `import { App } from './App.tsrx'; export function Child() @{ <aside>Child</aside> }`;
	let plugin: ReturnType<typeof marklessServer>;
	const transformRequest = vi.fn(async (url: string) =>
		callTransform(plugin, childSource, url, {
			resolve: vi.fn(async (specifier: string) => ({
				id: specifier === './App.tsrx' ? importerFilename : childFilename,
			})),
		}),
	);
	plugin = marklessServer({ dev: true, devServer: { transformRequest } });
	callBuildStart(plugin, { cwd: '/workspace/app' });

	await expect(
		callTransform(plugin, parentSource, importerFilename, {
			resolve: vi.fn(async () => ({ id: childFilename })),
		}),
	).resolves.toMatchObject({ code: expect.stringContaining('Parent') });
	expect(transformRequest).toHaveBeenCalledExactlyOnceWith(childFilename, 'server');
});

test('linking leaves source-module output unchanged when there are no tsrx imports', async () => {
	const source = `export function App() @{ <main>Standalone</main> }`;
	const direct = await transformTsrxModule({
		filename: importerFilename,
		source,
		environment: 'server',
		executionLog: 'auto',
	});
	const plugin = marklessServer();
	callBuildStart(plugin, { cwd: '/workspace/app' });
	const linked = (await callTransform(plugin, source, importerFilename)) as { code: string };

	expect(linked.code).toBe(direct.code);
});
