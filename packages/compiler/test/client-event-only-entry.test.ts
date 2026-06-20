import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const keyedRowsSource = `
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
		<button id="runlots" onClick={() => {
			rows = buildData(nextId, 10000);
			nextId = nextId + 10000;
			selected = null;
		}}>Create 10,000 rows</button>
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

test('client event-only entry emits detached batched keyed row replacement', async () => {
	const result = await compileTsrxModule({
		filename: 'src/KeyedRows.tsrx',
		source: keyedRowsSource,
		symbols: [],
	});

	const moduleSource = result.clientEventOnlyEntry.moduleSource ?? '';

	expect(moduleSource).toContain('function createRowBatch');
	expect(moduleSource).toContain('const rowElements = tbody.children;');
	expect(moduleSource).toContain('tbody.remove();');
	expect(moduleSource).toContain('tbodyParent.insertBefore(tbody, tbodyNextSibling);');
	expect(moduleSource).not.toContain('payloadView');
	expect(moduleSource.length).toBeLessThan(9200);
	expect(moduleSource).not.toContain('const rowNodes = []');
	expect(moduleSource).not.toContain('const rowById = new Map()');
	expect(moduleSource).not.toContain('__arcadeRow');
});
