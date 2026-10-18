import { expect, test, vi } from 'vitest';
import { marklessClient } from '../src/rolldown.ts';
import { transformTsrxModule } from '../src/transform.ts';
import { callBuildStart, callLoad, callResolveId, callTransform } from './helpers.ts';

// The browser builds a row it never served from this surface, so a copy taken
// before the owner linked its children names no bound symbol for the row's handlers.

const filename = '/workspace/app/pages/columns.tsrx';
const childFilename = '/workspace/app/components/HeaderCell.tsrx';

const page = `import { state } from '@markless/core';
import { HeaderCell } from '../components/HeaderCell.tsrx';
export default function Columns() @{
	let sort = state('');
	let cols = state([{ id: 'a' }, { id: 'b' }]);
	<section>
		@for (const col of cols; key col.id) {
			<HeaderCell label={col.id} onSort={() => (sort = col.id)} />;
		}
		<output>{sort}</output>
	</section>
}`;

const child = `export function HeaderCell({ label, onSort }) @{
	<button onClick={() => onSort()}>{label}</button>
}`;

test('a render-data load waits for its owner to finish linking', async () => {
	const firstPass = await transformTsrxModule({
		filename,
		moduleId: 'pages/columns.tsrx',
		source: page,
		environment: 'client',
	});
	const renderData = firstPass.virtualModules.find((module) => module.type === 'render-data');
	expect(renderData).toBeDefined();
	const plugin = marklessClient();
	const resolve = vi.fn(async (specifier: string) =>
		specifier === '../components/HeaderCell.tsrx' ? { id: childFilename } : null,
	);
	let earlyLoad: Promise<unknown> | undefined;
	let loadedBeforeLink = false;
	const load = vi.fn(async ({ id }: { id: string }) => {
		if (!earlyLoad) {
			expect(await callResolveId(plugin, renderData!.id)).toEqual(
				expect.objectContaining({ id: `\0${renderData!.id}` }),
			);
			earlyLoad = callLoad(plugin, `\0${renderData!.id}`) as Promise<unknown>;
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
	await callTransform(plugin, page, filename, { resolve, load });
	expect(load).toHaveBeenCalled();
	const finalSource = (await callLoad(plugin, `\0${renderData!.id}`)) as string;
	expect(finalSource).toMatch(/"boundSymbols":\{"symbol:\d+":"bound:/);
	expect(await earlyLoad).toBe(finalSource);
});
