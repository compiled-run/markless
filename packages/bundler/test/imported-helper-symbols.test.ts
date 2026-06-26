import { expect, test } from 'vitest';
import { transformTsrxModule } from '../src/transform.ts';

test('transformTsrxModule serves imported helper assignment event symbols', async () => {
	const result = await transformTsrxModule({
		filename: '/workspace/app/src/ListControls.tsrx',
		source: `
import { state } from 'arcade';
import { appendItems, makeItems } from './items';

export function App() @{
	let items = state([]);
	let selected = state(null);
	let nextId = state(1);

	<section>
		<button onClick={() => {
			items = makeItems(nextId, 10);
			nextId = nextId + 10;
			selected = null;
		}}>Create</button>
		<button onClick={() => {
			items = appendItems(items, nextId, 10);
			nextId += 10;
		}}>Append</button>
		<ul>
			@for (const item of items; key item.id) {
				<li class={selected === item.id ? 'selected' : ''}>{item.label}</li>
			}
		</ul>
	</section>
}
`,
	});
	const symbolSources = result.virtualModules
		.filter((module) => module.type === 'symbol')
		.map((module) => module.source);

	expect(symbolSources).toEqual(
		expect.arrayContaining([
			expect.stringContaining('import { makeItems } from "./items";'),
			expect.stringContaining('value: makeItems(context.graph.read("state:nextId"), 10)'),
			expect.stringContaining('value: null'),
			expect.stringContaining('import { appendItems } from "./items";'),
			expect.stringContaining(
				'value: appendItems(context.graph.read("state:items"), context.graph.read("state:nextId"), 10)',
			),
		]),
	);
});
