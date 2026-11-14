import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A flip or settle the browser renders draws only the component holding it, so its definition names the same-file edge
// chains that can place it, each from a component nothing else in the file places, with the rows each edge sits in.

const SOURCE = `
import { computed, state } from '@markless/core';

export function Owner({ value }) @{
	const doubled = computed(async () => await Promise.resolve(value * 2));

	@try {
		<b>{doubled}</b>
	} @pending {
		<i>loading</i>
	}
}

function Middle({ value }) @{
	<section><Owner value={value} /></section>
}

export function First() @{
	let value = state(1);

	<main><Middle value={value} /></main>
}

export function Rows() @{
	let rows = state([{ id: 1 }]);

	<ul>
		@for (const row of rows; key row.id) {
			<li><Owner value={row.id} /></li>
		}
	</ul>
}
`;

type Definition = {
	readonly name: string;
	readonly edges?: ReadonlyArray<{ readonly id: string; readonly childComponentName: string; readonly symbolPrefix: string }>;
	readonly placements?: ReadonlyArray<ReadonlyArray<{ readonly edgeId: string; readonly prefix: string; readonly rows?: number }>>;
};

async function definitions(source: string): Promise<ReadonlyMap<string, Definition>> {
	const compiled = await compileTsrxModule({ filename: 'src/Owner.tsrx', source, symbols: [] });
	const all = compiled.publicRenderModule.componentDefinitions as ReadonlyArray<Definition>;
	return new Map(all.map((definition) => [definition.name, definition]));
}

test('an owner its file places names every chain from a component nothing in the file places, rows included', async () => {
	const byName = await definitions(SOURCE);
	const edge = (parent: string, child: string) => {
		const found = byName.get(parent)!.edges!.find((candidate) => candidate.childComponentName === child)!;
		return { edgeId: found.id, prefix: found.symbolPrefix };
	};

	expect(byName.get('Owner')!.placements).toEqual([
		[edge('First', 'Middle'), edge('Middle', 'Owner')],
		[{ ...edge('Rows', 'Owner'), rows: 1 }],
	]);
	// Neither holds a branch or a boundary, so nothing renders rooted at it.
	expect(byName.get('Middle')!.placements).toBeUndefined();
	expect(byName.get('First')!.placements).toBeUndefined();
});

test('an owner whose @if the browser flips without drawing it names no placement', async () => {
	const byName = await definitions(`
import { state } from '@markless/core';

function Toggle({ label }) @{
	let open = state(false);

	<div onClick={() => (open = !open)}>
		@if (open) {
			<b>{label}</b>
		}
	</div>
}

export default function Page() @{
	<main><Toggle label="more" /></main>
}
`);
	expect(byName.get('Toggle')!.placements).toBeUndefined();
});

test('a component nothing in its file places names no placement', async () => {
	const byName = await definitions(`
import { state } from '@markless/core';

export default function Alone() @{
	let open = state(false);

	<div onClick={() => (open = !open)}>
		@if (open) {
			<b>open</b>
		}
	</div>
}
`);
	expect(byName.get('Alone')!.placements).toBeUndefined();
});
