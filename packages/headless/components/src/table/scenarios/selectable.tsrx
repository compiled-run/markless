import { table } from '../../index.ts';

// Rung 3: one prop, and the rows can be picked. There is no selection mode to
// choose - having somewhere to put the picked set is what makes them selectable.
export default function Selectable() @{
	<table.root value={[]} data-testid="root">
		<caption>Files</caption>
		<thead>
			<tr>
				<th>Name</th>
				<th>Size</th>
			</tr>
		</thead>
		<tbody>
			<table.item value="readme" data-testid="readme-item">
				<td data-testid="readme-name">README.md</td>
				<td>4.1 kB</td>
			</table.item>
			<table.item value="license" data-testid="license-item">
				<td data-testid="license-name">LICENSE</td>
				<td>1.1 kB</td>
			</table.item>
			<table.item value="changelog" data-testid="changelog-item">
				<td data-testid="changelog-name">CHANGELOG.md</td>
				<td>12.4 kB</td>
			</table.item>
		</tbody>
	</table.root>
}
