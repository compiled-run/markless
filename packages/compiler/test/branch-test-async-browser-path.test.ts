import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// The browser graph holds an async computed as a snapshot; a bare test of it reads the snapshot's value, which the served render already has.
const pane = (arms: string) => `import { computed, state } from '@markless/core';

export default function Pane() @{
	let id = state(0);
	const order = computed(async () => (id === 0 ? null : { code: String(id) }));

	<article>
		<button type="button" onClick={() => id++}>Next</button>
		@try {
			${arms}
		} @pending { <p>Loading</p> }
	</article>
}
`;

async function compile(source: string) {
	return compileTsrxModule({
		filename: '/src/pane.tsrx',
		buildId: 'branch-test',
		resolverId: 'branch-test',
		symbols: [],
		source,
	});
}

test.each([
	['@if (order) { <p>{order?.code}</p> }', 'right inside the @try'],
	['<section>@if (order) { <p>{order?.code}</p> } @else { <p>None</p> }</section>', 'one element in, with @else'],
])('a bare async test reads the value in the browser and the authored value on the server: %s (%s)', async (arms) => {
	const result = await compile(pane(arms));
	const record = result.protocolView.asyncBoundaries[0]?.armRecords?.[0]?.branches?.[0];
	expect(record?.testReads).toEqual([expect.objectContaining({ graphNodeId: 'computed:order', path: ['value'] })]);
	expect(result.renderData.branches[0]?.testReads).toEqual([{ graphNodeId: 'computed:order', path: [] }]);
});
