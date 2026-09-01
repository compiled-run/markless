import { table } from '../../index.ts';

// One row nobody can reach in a table whose other rows can be picked. The walk
// steps over it, and neither a press nor the space bar may pick it.
export default function DisabledRow() @{
	<table.root multiple value={[]} data-testid="root">
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
			<table.item disabled value="license" data-testid="license-item">
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
