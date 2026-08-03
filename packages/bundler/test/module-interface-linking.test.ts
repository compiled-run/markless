import { expect, test, vi } from 'vitest';
import { marklessClient, marklessServer, transformTsrxModule } from '../src/rolldown.ts';
import { callBuildStart, callLoad, callResolveId, callTransform } from './helpers.ts';

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

test('concurrent symbols-only transforms preserve sibling render-data artifacts', async () => {
	const plugin = marklessClient();
	const children = [
		{
			filename: '/workspace/app/src/LeftChild.tsrx',
			source: `export function LeftChild() @{ <button onClick={() => undefined}>Left</button> }`,
		},
		{
			filename: '/workspace/app/src/RightChild.tsrx',
			source: `export function RightChild() @{ <button onClick={() => undefined}>Right</button> }`,
		},
	];
	callBuildStart(plugin, { cwd: '/workspace/app' });
	await Promise.all(children.map((child) => callTransform(plugin, child.source, child.filename)));

	const symbolsTransforms = children.map((child) =>
		callTransform(plugin, child.source, `${child.filename}?markless-symbols`),
	);
	for (const child of children) {
		const renderDataId = `virtual:markless:render-data:${encodeURIComponent(child.filename)}`;
		await expect(callResolveId(plugin, renderDataId)).resolves.toMatchObject({
			id: `\0${renderDataId}`,
		});
	}
	await Promise.all(symbolsTransforms);
});

test('linked child symbol resolution fails loudly when its registered module is absent', async () => {
	const childFilename = '/workspace/app/src/Child.tsrx';
	const childSource = `export function Child() @{ <button onClick={() => undefined}>Child</button> }`;
	const parentSource = `import { Child } from './Child.tsrx'; export function App() @{ <Child /> }`;
	const plugin = marklessClient();
	const resolve = vi.fn(async (specifier: string) =>
		specifier === './Child.tsrx' ? { id: childFilename } : null,
	);
	callBuildStart(plugin, { cwd: '/workspace/app' });
	const child = await callTransform(plugin, childSource, childFilename, { resolve });
	await callTransform(plugin, parentSource, importerFilename, { resolve });
	const childSymbolId = child.manifest.symbols[0]!.virtualModuleId;

	expect(await callResolveId(plugin, childSymbolId)).toMatchObject({
		id: `\0${childSymbolId}`,
	});
	plugin.api.invalidateGeneratedModules(childFilename, 'client');
	await expect(callResolveId(plugin, childSymbolId)).rejects.toThrow(
		`MARKLESS_CHILD_SYMBOL_MISSING: Linked child ${JSON.stringify(childFilename)} does not provide requested symbol module ${JSON.stringify(childSymbolId)}.`,
	);
});

test('prerender child render-data imports use the linked interface filename', async () => {
	const childFilename = '/workspace/packages/ui/src/Badge.tsrx';
	const child = await transformTsrxModule({
		filename: childFilename,
		source: `export function Badge() @{ <strong>Ready</strong> }`,
		environment: 'client',
		prerenderRecords: true,
	});
	const parent = await transformTsrxModule({
		filename: importerFilename,
		source: `import { Badge } from '@workspace/ui/Badge.tsrx'; export function App() @{ <Badge /> }`,
		environment: 'client',
		prerenderRecords: true,
		importedModuleInterfaces: {
			'@workspace/ui/Badge.tsrx': child.moduleGraphInterface,
		},
	});
	const renderDataModule = parent.virtualModules.find(
		(module) => module.type === 'render-data',
	);

	expect(renderDataModule?.source).toContain(
		`from ${JSON.stringify(`virtual:markless:render-data:${encodeURIComponent(childFilename)}`)}`,
	);
	expect(renderDataModule?.source).not.toContain(
		'virtual:markless:render-data:%40workspace%2Fui%2FBadge.tsrx',
	);
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
	expect(result.code).toContain('virtual:markless:render-data:');
	const renderDataModule = result.virtualModules.find((module) => module.type === 'render-data');
	expect(renderDataModule?.source).toContain('"statics":["<p>Ready</p>"]');
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
	).resolves.toMatchObject({ code: expect.stringContaining('virtual:markless:render-data:') });
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

test('a child implementation edit reuses the parent while its versioned interface is unchanged', async () => {
	const childFilename = '/workspace/app/src/Child.tsrx';
	const parentSource = `import { Child } from './Child.tsrx'; export function App() @{ <main><Child /></main> }`;
	let childSource = `export function Child() @{ <p>Before</p> }`;
	let plugin: ReturnType<typeof marklessServer>;
	const resolve = vi.fn(async (specifier: string) =>
		specifier === './Child.tsrx' ? { id: childFilename } : null,
	);
	const transformRequest = vi.fn(async (url: string) =>
		callTransform(plugin, childSource, url, { resolve }),
	);
	plugin = marklessServer({ dev: true, devServer: { transformRequest } });
	callBuildStart(plugin, { cwd: '/workspace/app' });

	const first = await callTransform(plugin, parentSource, importerFilename, { resolve });
	childSource = `export function Child() @{ <p>After</p> }`;
	await callTransform(plugin, childSource, childFilename, { resolve });
	const second = await callTransform(plugin, parentSource, importerFilename, { resolve });

	expect(second).toBe(first);
	const childRenderDataId = `virtual:markless:render-data:${encodeURIComponent(childFilename)}`;
	const childRenderData = await callLoad(plugin, `\0${childRenderDataId}`);
	expect(childRenderData).toContain('After');
	expect(childRenderData).not.toContain('Before');
});

test('a child interface edit recompiles the parent', async () => {
	const childFilename = '/workspace/app/src/Child.tsrx';
	const parentSource = `import { Child } from './Child.tsrx'; export function App() @{ <main><Child /></main> }`;
	let childSource = `export function Child() @{ <p>Child</p> }`;
	let plugin: ReturnType<typeof marklessServer>;
	const resolve = vi.fn(async (specifier: string) =>
		specifier === './Child.tsrx' ? { id: childFilename } : null,
	);
	const transformRequest = vi.fn(async (url: string) =>
		callTransform(plugin, childSource, url, { resolve }),
	);
	plugin = marklessServer({ dev: true, devServer: { transformRequest } });
	callBuildStart(plugin, { cwd: '/workspace/app' });

	const first = await callTransform(plugin, parentSource, importerFilename, { resolve });
	childSource = `export function Child({ title }) @{ <p>{title}</p> }`;
	await callTransform(plugin, childSource, childFilename, { resolve });
	const second = await callTransform(plugin, parentSource, importerFilename, { resolve });

	expect(second).not.toBe(first);
});

test('render-data-only invalidation keeps the linked module graph intact', async () => {
	const childFilename = '/workspace/app/src/Child.tsrx';
	const parentSource = `import { Child } from './Child.tsrx'; export function App() @{ <main><Child /></main> }`;
	let childSource = `export function Child() @{ <p>Before</p> }`;
	let plugin: ReturnType<typeof marklessClient>;
	const resolve = vi.fn(async (specifier: string) =>
		specifier === './Child.tsrx' ? { id: childFilename } : null,
	);
	const transformRequest = vi.fn(async (url: string) =>
		callTransform(plugin, childSource, url, { resolve }),
	);
	plugin = marklessClient({ dev: true, devServer: { transformRequest } });
	callBuildStart(plugin, { cwd: '/workspace/app' });

	await callTransform(plugin, parentSource, importerFilename, { resolve });
	await callTransform(plugin, childSource, childFilename, { resolve });
	childSource = `export function Child() @{ <p>After</p> }`;

	const invalidated = await plugin.api.invalidateGeneratedModules(
		childFilename,
		'client',
		childSource,
	);

	expect(invalidated).toEqual([
		`\0virtual:markless:render-data:${encodeURIComponent(childFilename)}`,
	]);
	expect(invalidated).not.toContain(
		`\0virtual:markless:resolver:${encodeURIComponent(importerFilename)}`,
	);
	const childRenderData = await callLoad(plugin, invalidated[0]!);
	expect(childRenderData).toContain('After');
	expect(childRenderData).not.toContain('Before');
});

test('a symbol implementation edit still invalidates all generated modules', async () => {
	const filename = '/workspace/app/src/Counter.tsrx';
	const before = `export function Counter() @{ <button onClick={() => console.log('before')}>Go</button> }`;
	const after = before.replace("console.log('before')", "console.log('after')");
	const plugin = marklessClient({ dev: true });
	callBuildStart(plugin, { cwd: '/workspace/app' });
	await callTransform(plugin, before, filename);

	const invalidated = await plugin.api.invalidateGeneratedModules(filename, 'client', after);

	expect(invalidated).toContain(
		`\0virtual:markless:symbol:${encodeURIComponent(filename)}:symbol%3A0`,
	);
	expect(invalidated).toContain(
		`\0virtual:markless:render-data:${encodeURIComponent(filename)}`,
	);
});

test('the interface cache keeps full and symbols-only client entries distinct', async () => {
	const plugin = marklessClient();
	callBuildStart(plugin, { cwd: '/workspace/app' });
	const source = `export function App() @{ <button onClick={() => undefined}>Ready</button> }`;

	const full = await callTransform(plugin, source, importerFilename);
	const symbolsOnly = await callTransform(plugin, source, `${importerFilename}?markless-symbols`);

	expect(symbolsOnly).not.toBe(full);
	expect((symbolsOnly as { code: string }).code).toContain('export { loadSymbol };');
	expect((symbolsOnly as { code: string }).code).not.toContain(
		'export default marklessCompiledApp',
	);
});
