import { expect, test } from 'vitest';
import { buildSemanticGraph, lowerStateAccess, planPayloadArena } from '../src/index.ts';
import { planSymbolResolver } from '../src/passes/symbol-resolver.ts';

test('event symbols keep writes that assign imported helper call results', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/ListControls.tsrx',
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
	</section>
}
`,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });

	const plan = planSymbolResolver({
		semanticGraph,
		payloadArena,
		stateLowering,
	});
	const createSymbol = plan.symbols.find(
		(symbol) =>
			symbol.kind === 'event-handler' && symbol.source.includes('makeItems(nextId, 10)'),
	);
	const appendSymbol = plan.symbols.find(
		(symbol) =>
			symbol.kind === 'event-handler' &&
			symbol.source.includes('appendItems(items, nextId, 10)'),
	);

	expect(createSymbol).toMatchObject({
		kind: 'event-handler',
		moduleImports: [
			{
				localName: 'makeItems',
				importedName: 'makeItems',
				source: './items',
				kind: 'named',
			},
		],
		writes: [
			expect.objectContaining({
				source: 'items',
				valueSource: 'makeItems(nextId, 10)',
			}),
			expect.objectContaining({
				source: 'nextId',
				valueSource: 'nextId + 10',
			}),
			expect.objectContaining({
				source: 'selected',
				valueSource: 'null',
			}),
		],
	});
	expect(appendSymbol).toMatchObject({
		kind: 'event-handler',
		moduleImports: [
			{
				localName: 'appendItems',
				importedName: 'appendItems',
				source: './items',
				kind: 'named',
			},
		],
		writes: [
			expect.objectContaining({
				source: 'items',
				valueSource: 'appendItems(items, nextId, 10)',
			}),
			expect.objectContaining({
				source: 'nextId',
				assignmentOperator: '+=',
				valueSource: '10',
			}),
		],
	});
});

test('event symbols scope repeated inline writes by handler span', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/ListControls.tsrx',
		source: `
import { state } from 'arcade';
import { makeItems } from './items';

export function App() @{
	let items = state([]);
	let selected = state(null);
	let nextId = state(1);

	<section>
		<button onClick={() => {
			items = makeItems(nextId, 1000);
			nextId += 1000;
			selected = null;
		}}>Create</button>
		<button onClick={() => {
			items = makeItems(nextId, 10000);
			nextId += 10000;
			selected = null;
		}}>Create many</button>
		<button onClick={() => {
			items = [];
			selected = null;
		}}>Clear</button>
	</section>
}
`,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });

	const plan = planSymbolResolver({
		semanticGraph,
		payloadArena,
		stateLowering,
	});
	const createSymbol = plan.symbols.find(
		(symbol) =>
			symbol.kind === 'event-handler' && symbol.source.includes('makeItems(nextId, 1000)'),
	);

	expect(createSymbol?.writes).toEqual([
		expect.objectContaining({
			source: 'items',
			valueSource: 'makeItems(nextId, 1000)',
		}),
		expect.objectContaining({
			source: 'nextId',
			assignmentOperator: '+=',
			valueSource: '1000',
		}),
		expect.objectContaining({
			source: 'selected',
			valueSource: 'null',
		}),
	]);
});
