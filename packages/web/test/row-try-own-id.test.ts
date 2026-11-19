import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../compiler/src/index.ts';

const HELPERS = /from '@markless\/web\/fns\/([^']+)'/g;

// The server render a built app runs: the compiled SSR module, not the browser's evaluator.
async function compiledPage(source: string) {
	const compiled = await compileTsrxModule({ filename: 'src/Shelf.tsrx', source, symbols: [] });
	const ssr = compiled.publicRenderModule.ssrModuleSource.replace(
		HELPERS,
		(_match, helper: string) => `from '${new URL(`../src/fns/${helper}.ts`, import.meta.url).href}'`,
	);
	const module = [
		`const payloadState = ${JSON.stringify(compiled.protocolState)};`,
		`const payloadView = ${JSON.stringify(compiled.protocolView)};`,
		`const marklessRenderData = ${JSON.stringify(compiled.renderData)};`,
		ssr,
		'export { marklessRenderSsr };',
	].join('\n');
	const rowTry = compiled.protocolView.asyncBoundaries[0]!.id;
	const loaded = (await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(module)}`)) as {
		readonly marklessRenderSsr: () => Promise<{
			readonly html: string;
			readonly view: {
				readonly asyncBoundaries: ReadonlyArray<{
					readonly id: string;
					readonly startAnchor: { readonly index: number };
				}>;
			};
		}>;
	};
	return { render: loaded.marklessRenderSsr, rowTry };
}

test("each keyed row's inline @try is its own boundary, named by the row's key, in the served page", async () => {
	const { render, rowTry } = await compiledPage(`
import { computed, state } from '@markless/core';
export function Shelf() @{
	const items = state([{ id: 'pen', name: 'Pen' }, { id: 'ink', name: 'Ink' }]);
	const stock = computed(async () => [{ id: 'pen', count: 10 }, { id: 'ink', count: 20 }]);
	<ul>
		@for (const item of items; key item.id) {
			<li>
				@try {
					<b>{item.name}: {stock.find((entry) => entry.id === item.id)?.count}</b>
				} @pending {
					<i>…</i>
				}
			</li>
		}
	</ul>
}`);
	const output = await render();
	expect(output.view.asyncBoundaries.map((boundary) => [boundary.id, boundary.startAnchor.index])).toEqual([
		[`r:pen:${rowTry}`, 0],
		[`r:ink:${rowTry}`, 2],
	]);
	expect(output.html).toContain(`<!--markless:async:r:pen:${rowTry}--><b>Pen: 10</b>`);
	expect(output.html).toContain(`<!--markless:async:r:ink:${rowTry}--><b>Ink: 20</b>`);
});
