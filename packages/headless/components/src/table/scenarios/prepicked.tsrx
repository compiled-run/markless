import { table } from '../../index.ts';

// Rows written picked. `value` is the whole picked set, named by each row's own
// value, and a form carries it out through the hidden `table.rowfield`.
export default function Prepicked() @{
	<table.root multiple value={['readme', 'changelog']} data-testid="root">
		<caption>Files</caption>
		<thead>
			<tr>
				<th>Name</th>
				<th>Size</th>
			</tr>
		</thead>
		<tbody>
			<table.item value="readme" data-testid="readme-item">
				<td data-testid="readme-name">
					README.md
					<table.rowfield name="files" data-testid="readme-rowfield" />
				</td>
				<td>4.1 kB</td>
			</table.item>
			<table.item value="license" data-testid="license-item">
				<td data-testid="license-name">
					LICENSE
					<table.rowfield name="files" data-testid="license-rowfield" />
				</td>
				<td>1.1 kB</td>
			</table.item>
			<table.item value="changelog" data-testid="changelog-item">
				<td data-testid="changelog-name">
					CHANGELOG.md
					<table.rowfield name="files" data-testid="changelog-rowfield" />
				</td>
				<td>12.4 kB</td>
			</table.item>
		</tbody>
	</table.root>
}
