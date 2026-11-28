import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../compiler/src/index.ts';

// A keyed @for over a prop its caller fixed shows rows the browser never reads back,
// so the render serves neither the list record nor the collection beside the HTML.

const HELPERS = /from '@markless\/web\/fns\/([^']+)'/g;

type Rendered = {
	readonly html: string;
	readonly state: { readonly cells?: ReadonlyArray<{ readonly graphNodeId: string; readonly value?: unknown }> };
	readonly view: { readonly keyedRepeats?: ReadonlyArray<{ readonly id: string }> };
};

async function serverRender(
	source: string,
	context?: Record<string, unknown>,
	props: Record<string, unknown> = {},
): Promise<Rendered> {
	const compiled = await compileTsrxModule({ filename: 'src/Page.tsrx', source, symbols: [] });
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
	const loaded = (await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(module)}`)) as {
		readonly marklessRenderSsr: (props?: unknown, context?: unknown) => Promise<Rendered>;
	};
	return loaded.marklessRenderSsr(props, context);
}

// The served cells that carry a list's items, by the instance that holds them.
function carried(rendered: Rendered, marker: string): string[] {
	return (rendered.state.cells ?? []).flatMap((cell) =>
		JSON.stringify(cell.value ?? null).includes(marker) ? [cell.graphNodeId] : [],
	);
}

const PAGE = `
import { state } from '@markless/core';
const shelf = [{ id: 'a', label: 'fixed-a' }, { id: 'b', label: 'fixed-b' }];
function Rows({ items }) @{
	<ul>
		@for (const item of items; key item.id) {
			<li>{item.label}</li>
		}
	</ul>
}
function Relay({ items }) @{
	<section><Rows items={items} /></section>
}
function Outer({ items }) @{
	<article><Relay items={items} /></article>
}
export default function Page() @{
	let live = state([{ id: 'x', label: 'live-x' }]);
	<main>
		<Rows items={[{ id: 'l', label: 'literal-l' }]} />
		<Rows items={shelf} />
		<Relay items={shelf} />
		<Outer items={shelf} />
		<Relay items={live} />
		<button onClick={() => (live = [...live, { id: 'y', label: 'live-y' }])}>more</button>
	</main>
}
`;

test('only the instance a changing value reaches serves its rows; fixed ones, forwarded one or two deep, serve none', async () => {
	const rendered = await serverRender(PAGE);
	for (const label of ['literal-l', 'fixed-a', 'fixed-b', 'live-x']) expect(rendered.html).toContain(label);
	expect(carried(rendered, 'literal-l')).toEqual([]);
	expect(carried(rendered, 'fixed-a')).toEqual([]);
	expect(carried(rendered, 'live-x').length).toBeGreaterThan(0);
	expect(rendered.view.keyedRepeats).toHaveLength(1);
});

test('a forced-arm probe render fixes nothing, so it keeps the rows the browser builds from', async () => {
	const rendered = await serverRender(PAGE, { prerenderSettle: {} });
	expect(carried(rendered, 'fixed-a').length).toBeGreaterThan(0);
	expect(rendered.view.keyedRepeats?.length).toBeGreaterThan(1);
});

const FORWARDS = `
function Rows({ items }) @{
	<ul>
		@for (const item of items; key item.id) {
			<li>{item.label}</li>
		}
	</ul>
}
export default function Page({ items }) @{
	<main><Rows items={items} /></main>
}
`;

test("an instance's own fixed props pass on, and a stamp naming another instance fixes nothing", async () => {
	const props = { items: [{ id: 'd', label: 'given-d' }] };
	const own = await serverRender(FORWARDS, { staticProps: { at: '', names: ['items'] } }, props);
	expect(own.html).toContain('given-d');
	expect(carried(own, 'given-d')).toEqual([]);
	expect(own.view.keyedRepeats ?? []).toHaveLength(0);
	const spread = await serverRender(FORWARDS, { staticProps: { at: 'c9:', names: ['items'] } }, props);
	expect(carried(spread, 'given-d').length).toBeGreaterThan(0);
	expect(spread.view.keyedRepeats).toHaveLength(1);
	const unstamped = await serverRender(FORWARDS, undefined, props);
	expect(carried(unstamped, 'given-d').length).toBeGreaterThan(0);
});
