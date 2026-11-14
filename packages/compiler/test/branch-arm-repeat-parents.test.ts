import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A branch arm names the lists whose parent element it renders, so the browser wires them whenever the arm shows.
const page = (body: string) => `import { computed, state } from '@markless/core';

export default function Page() @{
	let open = state(false);
	let items = state<Array<{ id: string; text: string }>>([]);
	const remote = computed(async () => (await fetch('/api/items')).json() as Promise<Array<{ id: string; text: string }>>);

	<article>
		<button type="button" onClick={() => (open = !open)}>Toggle</button>
		${body}
	</article>
}
`;

async function view(body: string) {
	const { protocolView } = await compileTsrxModule({ filename: 'src/Page.tsrx', symbols: [], source: page(body) });
	return protocolView;
}

const list = (collection: string) => `<ul>@for (const item of ${collection}; key item.id) { <li>{item.text}</li> }</ul>`;

test('an @if arm names its list by module id and the parent address in the arm', async () => {
	const result = await view(`@if (open) { ${list('items')} }`);
	expect(result.keyedRepeats?.map((repeat) => repeat.id)).toEqual(['repeat:0']);
	expect(result.branches?.[0]?.armRecords?.map((arm) => arm.repeatParents)).toEqual([
		[{ repeatId: 'repeat:0', parentHostPath: [0] }],
		undefined,
	]);
});

test('each @switch arm names only its own list', async () => {
	const result = await view(`@switch (open) { @case true: { <section><p>one</p>${list('items')}</section> } @case false: { <p>none</p> } }`);
	expect(result.branches?.[0]?.armRecords?.map((arm) => arm.repeatParents)).toEqual([
		[{ repeatId: 'repeat:0', parentHostPath: [0, 1] }],
		undefined,
	]);
});

test('a list in a nested arm belongs to the inner branch only', async () => {
	const result = await view(`@if (open) { <section>@if (items.length > 0) { ${list('items')} }</section> }`);
	const byId = new Map(result.branches?.map((branch) => [branch.id, branch.armRecords?.map((arm) => arm.repeatParents)]));
	expect(byId.get('branch-site:0')?.some(Boolean) ?? false).toBe(false);
	expect(byId.get('branch-site:1')).toEqual([[{ repeatId: 'repeat:0', parentHostPath: [0] }], undefined]);
});

test('an @if in a @try arm names its list on the arm-scoped record', async () => {
	const result = await view(`@try { <div>@if (remote.length > 0) { ${list('remote')} }</div> } @pending { <p>Loading</p> }`);
	const arms = result.asyncBoundaries[0]?.armRecords;
	const branch = (Array.isArray(arms) ? arms[0] : arms)?.branches?.[0];
	expect(branch?.armRecords?.map((arm) => arm.repeatParents)).toEqual([
		[{ repeatId: 'repeat:0', parentHostPath: [0] }],
		undefined,
	]);
});

test('arms that hold no list carry no field', async () => {
	const result = await view(`@if (open) { <p>shown</p> } @else { ${list('items')} }`);
	expect(result.branches?.[0]?.armRecords?.[0]).not.toHaveProperty('repeatParents');
	expect(result.branches?.[0]?.armRecords?.[1]?.repeatParents).toEqual([{ repeatId: 'repeat:0', parentHostPath: [0] }]);
});
