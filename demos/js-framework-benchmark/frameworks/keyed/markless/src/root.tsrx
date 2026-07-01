import { state } from '@markless/core';
import {
	appendRows,
	buildData,
	removeRow,
	swapRows,
	updateEveryTenth,
	type Row,
} from './data.ts';

export function App() @{
	let rows = state<Row[]>([]);
	let selected = state(0);

	<div class="container">
		<div class="jumbotron"><div class="row">
			<div class="col-md-6"><h1>Markless keyed</h1></div>
			<div class="col-md-6"><div class="row">
				<div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="run" onClick={() => { rows = buildData(1000); selected = 0; }}>Create 1,000 rows</button></div>
				<div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="runlots" onClick={() => { rows = buildData(10000); selected = 0; }}>Create 10,000 rows</button></div>
				<div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="add" onClick={() => rows = appendRows(rows, 1000)}>Append 1,000 rows</button></div>
				<div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="update" onClick={() => rows = updateEveryTenth(rows)}>Update every 10th row</button></div>
				<div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="clear" onClick={() => { rows = []; selected = 0; }}>Clear</button></div>
				<div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="swaprows" onClick={() => rows = swapRows(rows)}>Swap Rows</button></div>
			</div></div>
		</div></div>
		<table class="table table-hover table-striped test-data"><tbody>
			@for (row of rows; key row.id) {
				<tr class={selected === row.id ? 'danger' : ''}>
					<td class="col-md-1">{row.id}</td>
					<td class="col-md-4"><a onClick={() => selected = row.id}>{row.label}</a></td>
					<td class="col-md-1"><a onClick={() => rows = removeRow(rows, row.id)}><span class="glyphicon glyphicon-remove" aria-hidden="true"></span></a></td>
					<td class="col-md-6"></td>
				</tr>
			}
		</tbody></table>
		<span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true"></span>
	</div>
}
