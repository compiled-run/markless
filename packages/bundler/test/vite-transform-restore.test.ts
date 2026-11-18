import { expect, test, vi } from 'vitest';
import { moduleIdFor } from '../src/module-id.ts';
import { markless } from '../src/vite/index.ts';
import {
	callConfigResolved,
	callConfigureServer,
	callHotUpdate,
	callLoad,
	callTransform,
	createViteHookContext,
	getPlugin,
} from './helpers.ts';

const root = '/workspace/app';
const file = `${root}/src/Panel.tsrx`;
const renderDataId = `\0virtual:markless:render-data:${encodeURIComponent(moduleIdFor(file, root))}`;

function devServer() {
	const plugin = getPlugin(markless(), 'vite-plugin-markless');
	const send = vi.fn();
	const modules = new Map<string, { id: string }>();
	const environment = {
		config: { consumer: 'client' },
		hot: { send },
		moduleGraph: {
			getModuleById: vi.fn((id: string) => {
				const module = modules.get(id) ?? { id };
				modules.set(id, module);
				return module;
			}),
			invalidateModule: vi.fn(),
		},
	};
	callConfigResolved(plugin, { base: '/', command: 'serve', root });
	callConfigureServer(plugin, { config: { root }, environments: { client: environment } });
	const save = (code: string, timestamp: number) =>
		callHotUpdate(
			plugin,
			{ file, modules: [], timestamp, type: 'update', read: async () => code },
			{ environment },
		);
	const invalidatedAt = (timestamp: number) =>
		environment.moduleGraph.invalidateModule.mock.calls
			.filter((call) => call[2] === timestamp)
			.map((call) => (call[0] as { id: string }).id);
	return { plugin, send, save, invalidatedAt };
}

const reload = {
	type: 'full-reload',
	path: '/src/Panel.tsrx',
	triggeredBy: file,
};

test('restoring the transformed source after a render-data-only edit reloads and serves the restored render data', async () => {
	const before = `export function Panel() @{ <p>Before</p> }`;
	const after = `export function Panel() @{ <p>After</p> }`;
	const { plugin, send, save, invalidatedAt } = devServer();
	await callTransform(plugin, before, file, createViteHookContext('client'));

	await save(after, 1);
	expect(invalidatedAt(1)).toContain(renderDataId);
	expect(await callLoad(plugin, renderDataId)).toContain('After');

	send.mockClear();
	await save(before, 2);

	expect(invalidatedAt(2)).toContain(renderDataId);
	expect(send).toHaveBeenCalledWith(reload);
	const restored = await callLoad(plugin, renderDataId);
	expect(restored).toContain('Before');
	expect(restored).not.toContain('After');
});

test('restoring the transformed source after an unrequested code edit reloads again', async () => {
	const before = `import { state } from '@markless/core';
export function Panel() @{ let count = state(0); <button onClick={() => count++}>{count}</button> }`;
	const after = before.replace('count++', 'count += 2');
	const { plugin, send, save } = devServer();
	await callTransform(plugin, before, file, createViteHookContext('client'));

	await save(after, 1);
	expect(send).toHaveBeenCalledWith(reload);

	send.mockClear();
	await save(before, 2);

	expect(send).toHaveBeenCalledWith(reload);
});

test('a content-identical save after a restore stays silent', async () => {
	const before = `export function Panel() @{ <p>Before</p> }`;
	const after = `export function Panel() @{ <p>After</p> }`;
	const { plugin, send, save, invalidatedAt } = devServer();
	await callTransform(plugin, before, file, createViteHookContext('client'));

	await save(after, 1);
	await save(before, 2);
	send.mockClear();
	await save(before, 3);

	expect(invalidatedAt(3)).toEqual([]);
	expect(send).not.toHaveBeenCalled();
});
