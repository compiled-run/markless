import { state } from '@markless/core';

type Row = { readonly id: string; readonly name: string; readonly qty: number; readonly unit: string };

export default function Stock() @{
	let rows = state<ReadonlyArray<Row>>([
		{ id: 'a', name: 'Apples', qty: 12, unit: 'crates' },
		{ id: 'b', name: 'Flour', qty: 4, unit: 'sacks' },
		{
			id: 'c',
			name: 'Plates',
			qty: 30,
			unit: 'boxes of the large ceramic dinner plates kept on the top shelf of the back storeroom',
		},
	]);
	let added = state(0);
	<main class="page">
		<style>
			.page {
				padding: 24px;
				background: #f8f9fa;
			}
			.header {
				margin: 0;
				padding: 12px 16px;
				border-radius: 10px;
				background: #264653;
				color: #ffffff;
				font-size: 22px;
				font-weight: 700;
			}
			.rows {
				margin: 16px 0 0;
				padding: 0;
				list-style: none;
			}
			.row {
				margin: 8px 0 0;
				padding: 12px 16px;
				border: 1px solid #ced4da;
				border-radius: 10px;
				background: #ffffff;
				color: #212529;
				font-size: 16px;
			}
			.qty {
				color: #2a9d8f;
				font-weight: 700;
			}
			.button {
				display: block;
				margin-top: 12px;
				padding: 10px 16px;
				border: 1px solid #ced4da;
				border-radius: 10px;
				background: #ffffff;
				color: #212529;
				font-family: inherit;
				font-size: 17px;
			}
		</style>
		<h1 class="header">Stock</h1>
		<ul class="rows">
			@for (const row of rows; key row.id) {
				<li>
					<p class="row">
						Item {row.name}:&nbsp;<span class="qty">{row.qty} {row.unit}</span>&nbsp;left
					</p>
				</li>
			}
		</ul>
		<button
			class="button"
			onClick={() => {
				added = added + 1;
				rows = [...rows, { id: `n${added}`, name: 'Pears', qty: 7, unit: 'trays' }];
			}}
		>
			Add row
		</button>
		<button class="button" onClick={() => (rows = rows.slice(1))}>
			Remove first row
		</button>
		<button
			class="button"
			onClick={() => (rows = rows.map((row) => (row.id === 'b' ? { ...row, qty: row.qty - 1 } : row)))}
		>
			Sell a sack of flour
		</button>
	</main>
}
