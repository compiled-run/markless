import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const ITEMS = `const ITEMS = [{ name: 'lyra' }, { name: 'maia' }, { name: 'nova' }];`;

const COMPUTED_ROWS = `
import { computed, state } from '@markless/core';
${ITEMS}
export function Page() @{
	let current = state('maia');
	const picked = computed(() => current.toUpperCase());
	<ul>
		@for (const item of ITEMS; key item.name) {
			<li data-checked={picked === item.name ? 'yes' : 'no'} onClick={() => current = item.name}>{item.name}</li>
		}
	</ul>
}
`;

const SHARED_ROWS = `
import { shared, state } from '@markless/core';
${ITEMS}
export const choice = shared(() => {
	const chosen = state({ name: 'maia' });
	return chosen;
});
function Rows() @{
	const chosen = choice();
	<ol>
		@for (const item of ITEMS; key item.name) {
			<li data-on={chosen.name === item.name ? 'on' : 'off'} onClick={() => chosen.name = item.name}>{item.name}</li>
		}
	</ol>
}
export function Page() @{
	<main><Rows /></main>
}
`;

const compile = (source: string) =>
	compileTsrxModule({ filename: 'src/RowSlots.tsrx', source, symbols: [] });

test('a computed only row slots read is served, so rows know what they painted', async () => {
	const compiled = await compile(COMPUTED_ROWS);
	const view = compiled.protocolView.keyedRepeats?.[0]?.rowTemplate;
	expect(view?.attributeSlots?.find((slot) => slot.name === 'data-checked')).toMatchObject({
		reads: [{ graphNodeId: 'computed:picked', path: [] }],
	});
	expect(compiled.publicRenderModule.ssrModuleSource).toMatch(
		/marklessSsrServeComputed\([^)]*"computed:picked"/,
	);
});

test('a row slot reading a shared() member follows that member’s graph node', async () => {
	const compiled = await compile(SHARED_ROWS);
	const slot = compiled.protocolView.keyedRepeats?.[0]?.rowTemplate?.attributeSlots?.find(
		(candidate) => candidate.name === 'data-on',
	);
	expect(slot).toMatchObject({
		source: "chosen.name === item.name ? 'on' : 'off'",
		reads: [{ graphNodeId: 'shared:src/RowSlots.tsrx#choice/state:chosen', path: ['name'] }],
	});
});

test('a same-module child seeds the shared() cell its row expression reads', async () => {
	const compiled = await compile(SHARED_ROWS);
	const ssr = compiled.publicRenderModule.ssrModuleSource;
	const childValues = /const marklessSsrStateValuesRows = new Map\(\[([^]*?)\]\);/.exec(ssr)?.[1];
	expect(childValues).toContain('"shared:src/RowSlots.tsrx#choice/state:chosen"');
});
