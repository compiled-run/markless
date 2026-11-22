import { state } from '@markless/core';

export default function App() @{
	let rows = state([
		{ id: 'a', name: 'Alpha row', rank: 0 },
		{ id: 'b', name: 'Beta row', rank: 0 },
	]);
	<main>
		<style>
			.list {
				display: flex;
				flex-direction: column;
				margin: 0 12px;
				padding: 0;
				list-style: none;
			}
			.item {
				height: 40px;
				font-size: 16px;
				background: #edf2f4;
			}
			.name {
				display: block;
			}
			.tap {
				display: block;
				margin: 12px;
				font-family: inherit;
				font-size: 18px;
				padding: 10px 18px;
				border: 2px solid #22223b;
				border-radius: 10px;
				background: #ffd166;
				color: #22223b;
			}
		</style>
		<h1>Row numbers</h1>
		<ul class="list">
			@for (const row of rows; key row.id) {
				<li class="item" style={`order: ${Math.round(row.rank)};`}><span class="name">{row.name}</span></li>
			}
		</ul>
		<button
			class="tap"
			onClick={() => (rows = rows.map((row) => (row.id === 'b' ? { ...row, rank: -1 } : row)))}
		>
			Lift beta
		</button>
	</main>
}
