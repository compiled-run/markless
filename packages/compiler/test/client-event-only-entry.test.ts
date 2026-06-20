import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const benchmarkShapedKeyedSource = `
import { state } from 'arcade';
import { appendRows, buildData, removeRow, swapRows, updateEveryTenthRow } from 'arcade-benchmark-data';

export function App() @{
	let rows = state([]);
	let selected = state(null);
	let nextId = state(1);

	<div class="container">
		<button id="run" onClick={() => {
			rows = buildData(nextId, 1000);
			nextId = nextId + 1000;
			selected = null;
		}}>Create 1,000 rows</button>
		<button id="add" onClick={() => {
			rows = appendRows(rows, nextId, 1000);
			nextId += 1000;
		}}>Append 1,000 rows</button>
		<button id="update" onClick={() => rows = updateEveryTenthRow(rows)}>Update every 10th row</button>
		<button id="clear" onClick={() => {
			rows = [];
			selected = null;
		}}>Clear</button>
		<button id="swaprows" onClick={() => rows = swapRows(rows)}>Swap Rows</button>
		<table><tbody>
			@for (const row of rows; key row.id) {
				<tr class={selected === row.id ? 'danger' : ''}>
					<td>{row.id}</td>
					<td><a onClick={() => selected = row.id}>{row.label}</a></td>
					<td><a onClick={() => rows = removeRow(rows, row.id)}><span class="remove"></span></a></td>
				</tr>
			}
		</tbody></table>
	</div>
}
`;

const alternateKeyedSource = `
import { state } from 'arcade';

export function App() @{
	let items = state([]);
	let activeKey = state(null);

	<section class="app">
		<button id="load" onClick={() => {
			items = [{ key: 1, name: 'one' }];
			activeKey = null;
		}}>Load</button>
		<ul>
			@for (const item of items; key item.key) {
				<li class={activeKey === item.key ? 'selected' : ''}>
					<button onClick={() => activeKey = item.key}>{item.name}</button>
					<i onClick={() => items = items.filter((entry) => entry.key !== item.key)}>x</i>
					<small>{item.key}</small>
				</li>
			}
		</ul>
	</section>
}
`;

test('client event-only entry is disabled until keyed repeat lowering is structural', async () => {
	for (const [filename, source] of [
		['src/BenchmarkShapedRows.tsrx', benchmarkShapedKeyedSource],
		['src/AlternateRows.tsrx', alternateKeyedSource],
	] as const) {
		const result = await compileTsrxModule({
			filename,
			source,
			symbols: [],
		});

		expect(result.clientEventOnlyEntry.moduleSource).toBeNull();
	}
});
