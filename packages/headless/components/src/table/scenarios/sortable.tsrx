import { state } from '@markless/core';
import { table } from '../../index.ts';

// Rung 2: one header swapped for a part, nothing restructured. The family never
// sorts anything - it reports which header was pressed, and the page decides what
// that means, which is the three lines every data library writes differently.
export default function Sortable() @{
	const log = state({ column: '', calls: 0 });

	<section>
		<table.root
			data-testid="root"
			sort={{ column: 'size', direction: 'descending' }}
			onSortChange={(column: string) => {
				log.column = column;
				log.calls = log.calls + 1;
			}}
		>
			<caption>Files</caption>
			<thead>
				<tr>
					<th data-testid="name-header">Name</th>
					<table.coltrigger value="size" data-testid="size-header">Size</table.coltrigger>
					<table.coltrigger value="changed" data-testid="changed-header">Changed</table.coltrigger>
				</tr>
			</thead>
			<tbody>
				<table.item value="readme" data-testid="readme-item">
					<td>README.md</td>
					<td>4.1 kB</td>
					<td>Today</td>
				</table.item>
				<table.item value="license" data-testid="license-item">
					<td>LICENSE</td>
					<td>1.1 kB</td>
					<td>Last week</td>
				</table.item>
			</tbody>
		</table.root>
		<p data-testid="column">{log.column}</p>
		<p data-testid="calls">{log.calls}</p>
	</section>
}
