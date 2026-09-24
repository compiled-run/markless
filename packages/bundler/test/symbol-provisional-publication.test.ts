import { expect, test, vi } from 'vitest';
import { createMarklessDevGraph } from '../src/dev.ts';
import { createPluginState, registerTransformArtifacts } from '../src/plugin-state.ts';
import { marklessClient } from '../src/rolldown.ts';
import { transformTsrxModule } from '../src/transform.ts';
import { callBuildStart, callLoad, callResolveId, callTransform } from './helpers.ts';

const filename = '/workspace/app/pages/settings.tsrx';
const childFilename = '/workspace/app/components/Choice.tsrx';

function fixture(prop: string, value: string) {
	return {
		page: `import { state } from '@markless/core';
import { Choice } from '../components/Choice.tsrx';
export default function Settings() @{
	let selected = state('none');
	<section><Choice ${prop}={(next) => selected = next} /><output>{selected}</output></section>
}`,
		child: `export function Choice({ ${prop} }) @{
	<button onClick={() => ${prop}?.(${JSON.stringify(value)})}>Choose</button>
}`,
	};
}

async function callbackModule(page: string) {
	const result = await transformTsrxModule({ filename, source: page, environment: 'client' });
	const module = result.virtualModules.find(
		(candidate) => candidate.type === 'symbol' && candidate.source.includes('context.args'),
	);
	expect(module).toBeDefined();
	return module!;
}

test.each([
	['onChange', 'chosen'],
	['onSelect', 'alternate'],
])('a %s symbol load waits for its owner to finish linking', async (prop, value) => {
	const source = fixture(prop, value);
	const module = await callbackModule(source.page);
	const plugin = marklessClient();
	const resolve = vi.fn(async (specifier: string) =>
		specifier === '../components/Choice.tsrx' ? { id: childFilename } : null,
	);
	let earlyLoad: Promise<unknown> | undefined;
	let loadedBeforeLink = false;
	const load = vi.fn(async ({ id }: { id: string }) => {
		if (!earlyLoad) {
			expect(await callResolveId(plugin, module.id)).toEqual(
				expect.objectContaining({ id: `\0${module.id}` }),
			);
			earlyLoad = callLoad(plugin, `\0${module.id}`) as Promise<unknown>;
			void earlyLoad.then(() => {
				loadedBeforeLink = true;
			});
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(loadedBeforeLink).toBe(false);
		}
		await callTransform(plugin, source.child, id, { resolve, load });
		return { id };
	});
	callBuildStart(plugin, { cwd: '/workspace/app' });
	await callTransform(plugin, source.page, filename, { resolve, load });
	expect(load).toHaveBeenCalled();
	const finalSource = (await callLoad(plugin, `\0${module.id}`)) as string;
	expect(finalSource).toContain('context.args');
	expect(await earlyLoad).toBe(finalSource);
	const emitted = await import(`data:text/javascript,${encodeURIComponent(finalSource)}`);
	const write = vi.fn();
	emitted[module.exportName!]({ args: [value], event: new Event('click'), graph: { write } });
	expect(write).toHaveBeenCalledExactlyOnceWith({
		graphNodeId: 'state:selected',
		path: [],
		value,
	});
});

test('a symbol from an owner that failed linking is not served provisionally', async () => {
	const source = fixture('onPick', 'chosen');
	const module = await callbackModule(source.page);
	const plugin = marklessClient();
	const resolve = vi.fn(async () => ({ id: childFilename }));
	const load = vi.fn(async () => {
		throw new Error('CHILD_LOAD_FAILED');
	});
	callBuildStart(plugin, { cwd: '/workspace/app' });
	await expect(callTransform(plugin, source.page, filename, { resolve, load })).rejects.toThrow(
		'CHILD_LOAD_FAILED',
	);
	await expect(callLoad(plugin, `\0${module.id}`)).rejects.toThrow('MARKLESS_SYMBOL_UNPUBLISHED');
});

test('a sibling first pass cannot replace a published symbol or its execution size', async () => {
	const state = createPluginState();
	const source = fixture('onCommit', 'saved').page;
	const result = await transformTsrxModule({ filename, source, environment: 'client' });
	const module = result.virtualModules.find((module) => module.type === 'symbol')!;
	const input = {
		owner: filename,
		source: filename,
		manifestSource: filename,
		result,
		dev: createMarklessDevGraph(),
		environment: 'client' as const,
	};
	registerTransformArtifacts(state, { ...input, finalPublication: true });
	const published = state.virtualModules.get(module.id);
	const size = state.executionLogEstimatedSizes.get(module.id);
	registerTransformArtifacts(state, {
		...input,
		owner: `${filename}?markless-symbols`,
		finalPublication: false,
		result: {
			...result,
			virtualModules: [{ ...module, source: 'export function pending() {}' }],
		},
	});
	expect(state.virtualModules.get(module.id)).toEqual(published);
	expect(state.executionLogEstimatedSizes.get(module.id)).toBe(size);
	const revision = {
		...module,
		source: `export function ${module.exportName}() { return 'updated'; }`,
	};
	registerTransformArtifacts(state, {
		...input,
		result: { ...result, virtualModules: [revision] },
		finalPublication: true,
	});
	expect(state.virtualModules.get(module.id)?.source).toContain("return 'updated'");
});
