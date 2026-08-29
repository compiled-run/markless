import { table } from '../../index.ts';

// Rung 1 of the ladder: the starter a consumer copies. No props, no parts beyond
// the rows, and nothing configured - so the family writes no role, no tabindex
// and no ARIA at all, and this is a plain HTML table.
export default function Basic() @{
	<table.root data-testid="root">
		<caption data-testid="caption">Files</caption>
		<thead>
			<tr>
				<th data-testid="name-header">Name</th>
				<th data-testid="size-header">Size</th>
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
