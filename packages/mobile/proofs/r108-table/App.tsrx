import { state } from '@markless/core';

export default function App() @{
	let plants = state([
		{ id: 'basil', name: 'Basil', count: 3 },
		{ id: 'mint', name: 'Mint', count: 12 },
	]);
	<main>
		<h1>Table</h1>
		<table>
			<caption>Seed stock</caption>
			<thead>
				<tr>
					<th>Plant</th>
					<th>Packets</th>
				</tr>
			</thead>
			<tbody>
				@for (const plant of plants; key plant.id) {
					<tr>
						<td>{plant.name}</td>
						<td>{plant.count}</td>
					</tr>
				}
			</tbody>
			<tfoot>
				<tr>
					<td>Kinds</td>
					<td>{plants.length}</td>
				</tr>
			</tfoot>
		</table>
		<button onClick={() => (plants = [...plants, { id: 'thyme', name: 'Thyme', count: 7 }])}>Add thyme</button>
	</main>
}
