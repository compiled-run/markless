import { expect, test, vi } from 'vitest';
import { createMarklessDevGraph } from '../src/dev.ts';
import { createPluginState, registerTransformArtifacts } from '../src/plugin-state.ts';
import { marklessClient } from '../src/rolldown.ts';
import { transformTsrxModule } from '../src/transform.ts';
import { callBuildStart, callLoad, callResolveId, callTransform } from './helpers.ts';

const filename = '/workspace/app/pages/tabs.tsrx';

const page = `import { state } from '@markless/core';
export default function Tabs() @{
	let active = state(0);
	<section>
		<button onClick={() => (active = 0)}>One</button>
		<button onClick={() => (active = 1)}>Two</button>
		<output>{active}</output>
	</section>
}`;

// Sibling requests (`?markless-resume`, `?markless-symbols`) of one page share these ids, and Rolldown
// loads each once: a later sibling's first pass replacing a final module shipped whichever came last.
test('a sibling first pass never replaces a module its source already published', async () => {
	const state = createPluginState();
	const result = await transformTsrxModule({ filename, source: page, environment: 'client' });
	expect(result.virtualModules.some((module) => module.type === 'payload')).toBe(true);
	const input = {
		source: filename,
		manifestSource: filename,
		dev: createMarklessDevGraph(),
		environment: 'client' as const,
	};
	registerTransformArtifacts(state, {
		...input,
		owner: `${filename}?markless-resume`,
		result,
		finalPublication: true,
	});
	const published = new Map(
		result.virtualModules.map((module) => [module.id, state.virtualModules.get(module.id)]),
	);
	registerTransformArtifacts(state, {
		...input,
		owner: `${filename}?markless-symbols`,
		request: `${filename}?markless-symbols`,
		finalPublication: false,
		result: {
			...result,
			virtualModules: result.virtualModules.map((module) => ({
				...module,
				source: `${module.source}\n// first pass`,
			})),
		},
	});
	for (const [id, module] of published) expect(state.virtualModules.get(id), id).toEqual(module);
	const revision = result.virtualModules.map((module) => ({
		...module,
		source: `${module.source}\n// relinked`,
	}));
	registerTransformArtifacts(state, {
		...input,
		owner: `${filename}?markless-symbols`,
		result: { ...result, virtualModules: revision },
		finalPublication: true,
	});
	for (const module of revision)
		expect(state.virtualModules.get(module.id)?.source, module.id).toContain('// relinked');
});

const parentFilename = '/workspace/app/pages/columns.tsrx';
const childFilename = '/workspace/app/components/HeaderCell.tsrx';
const parent = `import { state } from '@markless/core';
import { HeaderCell } from '../components/HeaderCell.tsrx';
export default function Columns() @{
	let sort = state('');
	<section>
		<HeaderCell label="a" onSort={() => (sort = 'a')} />
		<output>{sort}</output>
	</section>
}`;
const child = `export function HeaderCell({ label, onSort }) @{
	<button onClick={() => onSort()}>{label}</button>
}`;

test('a payload load waits for its owner to finish linking', async () => {
	const firstPass = await transformTsrxModule({
		filename: parentFilename,
		moduleId: 'pages/columns.tsrx',
		source: parent,
		environment: 'client',
	});
	const payload = firstPass.virtualModules.find((module) => module.type === 'payload')!;
	const plugin = marklessClient();
	const resolve = vi.fn(async (specifier: string) =>
		specifier === '../components/HeaderCell.tsrx' ? { id: childFilename } : null,
	);
	let earlyLoad: Promise<unknown> | undefined;
	let loadedBeforeLink = false;
	const load = vi.fn(async ({ id }: { id: string }) => {
		if (!earlyLoad) {
			expect(await callResolveId(plugin, payload.id)).toEqual(
				expect.objectContaining({ id: `\0${payload.id}` }),
			);
			earlyLoad = callLoad(plugin, `\0${payload.id}`) as Promise<unknown>;
			void earlyLoad.then(() => {
				loadedBeforeLink = true;
			});
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(loadedBeforeLink).toBe(false);
		}
		await callTransform(plugin, child, id, { resolve, load });
		return { id };
	});
	callBuildStart(plugin, { cwd: '/workspace/app' });
	await callTransform(plugin, parent, parentFilename, { resolve, load });
	expect(load).toHaveBeenCalled();
	expect(await earlyLoad).toBe(await callLoad(plugin, `\0${payload.id}`));
});
