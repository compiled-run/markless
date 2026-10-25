import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { resolveBoundaryRunners } from '../src/passes/public-render/boundary-runner.ts';

// A child in the same module destructures a prop spelled like the parent's async value; the edge names the parent's node.
const shadowed = (childProp: string, parentLocal: string) => `import { computed, state } from '@markless/core';

function Card({ ${childProp} }) @{
	let open = state(false);
	<article onClick={() => (open = !open)}>{${childProp}.title}</article>
}

export default function Shelf() @{
	const ${parentLocal} = computed(async () => ({ title: 'Atlas' }));
	<main>
		@try {
			<Card ${childProp}={${parentLocal}} />
		} @pending {
			<p>loading</p>
		}
	</main>
}
`;

test.each([
	['book', 'book'],
	['volume', 'volume'],
	['volume', 'book'],
])('a @try arm handing its async value to prop "%s" (parent local "%s") gates on the parent computed', async (childProp, parentLocal) => {
	const result = await compileTsrxModule({
		filename: 'src/shelf.tsrx',
		source: shadowed(childProp, parentLocal),
		symbols: [],
	});
	const runner = resolveBoundaryRunners(result.semanticGraph).get('boundary:0');
	expect(runner?.runnerGraphNodeId).toBe(`computed:${parentLocal}`);
	expect(runner?.reads.map((read) => read.graphNodeId)).toEqual([`computed:${parentLocal}`]);
});
