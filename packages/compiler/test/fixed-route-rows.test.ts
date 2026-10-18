import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A page's props come from the router, which renders the page once and never
// changes them in place. Rows that read only those props (through computeds)
// and their own items can never change in the browser, so their record ships
// no row markup and the page demands no row-building runtime.
async function compile(source: string, routeRoot: boolean) {
	const result = await compileTsrxModule({
		filename: 'pages/index.tsrx',
		source,
		symbols: [],
		...(routeRoot ? { routeRoot: true } : {}),
	});
	const repeat = result.protocolView.keyedRepeats?.[0];
	const demand = result.runtimeDemandMap.payloadRecords.find(
		(record) => record.kind === 'keyed-repeat',
	);
	return { repeat, demand: demand?.runtimeModuleIds ?? [] };
}

const fromProps = `import { computed, state } from '@markless/core';

export default function Page({ url }) @{
	let picked = state('');
	const items = computed(() => url.search.split('&').map((part) => ({ id: part, label: part.toUpperCase() })));
	<main>
		<p>{picked}</p>
		<ul>
			@for (const item of items; key item.id) {
				<li onClick={() => (picked = item.id)}>{item.label}</li>
			} @empty {
				<li>none</li>
			}
		</ul>
	</main>
}
`;

test("rows over a page root's props are fixed: no row markup and no row-building demand", async () => {
	const { repeat, demand } = await compile(fromProps, true);
	expect(repeat).toMatchObject({ fixed: true });
	expect(repeat).not.toHaveProperty('rowTemplate');
	expect(repeat).not.toHaveProperty('emptyArm');
	expect(repeat?.rowEvents).toHaveLength(1);
	expect(demand).not.toContain('web/fns/row-mint');
	expect(demand).not.toContain('web/fns/ssr');
});

test('the same rows on a module that may be rendered as a child keep their row markup', async () => {
	const { repeat, demand } = await compile(fromProps, false);
	expect(repeat).not.toHaveProperty('fixed');
	expect(repeat).toHaveProperty('rowTemplate');
	expect(demand).toContain('web/fns/row-mint');
});

test('rows over page state, or rows that show page state, can change', async () => {
	const overState = fromProps.replace(
		"const items = computed(() => url.search.split('&')",
		"const items = computed(() => (picked + url.search).split('&')",
	);
	expect((await compile(overState, true)).repeat).not.toHaveProperty('fixed');
	const showsState = fromProps.replace(
		'<li onClick={() => (picked = item.id)}>{item.label}</li>',
		'<li class={picked} onClick={() => (picked = item.id)}>{item.label}</li>',
	);
	expect((await compile(showsState, true)).repeat).not.toHaveProperty('fixed');
});
