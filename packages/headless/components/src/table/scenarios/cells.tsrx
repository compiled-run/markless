import { table } from '../../index.ts';

// Rung 4: the `<td>`s become parts and every cell is a focus stop, so the arrows
// walk in two directions. Nothing was restructured to get here. No selection prop
// is passed, so the table writes no role and stays a plain HTML table - cells
// alone cannot earn one, because a root cannot see what its descendants mounted.
//
// The first cell of each row is its row header: it is what names the row for a
// reader, and it renders `<th>` rather than a `<td>`.
export default function Cells() @{
	<table.root data-testid="root">
		<caption>Files</caption>
		<thead>
			<tr>
				<th>Name</th>
				<th>Size</th>
				<th>Changed</th>
			</tr>
		</thead>
		<tbody>
			<table.item value="readme" data-testid="readme-item">
				<table.rowcontent rowheader data-testid="readme-name">README.md</table.rowcontent>
				<table.rowcontent data-testid="readme-size">4.1 kB</table.rowcontent>
				<table.rowcontent data-testid="readme-changed">Today</table.rowcontent>
			</table.item>
			<table.item value="license" data-testid="license-item">
				<table.rowcontent rowheader data-testid="license-name">LICENSE</table.rowcontent>
				<table.rowcontent data-testid="license-size">1.1 kB</table.rowcontent>
				<table.rowcontent data-testid="license-changed">Last week</table.rowcontent>
			</table.item>
			<table.item value="changelog" data-testid="changelog-item">
				<table.rowcontent rowheader data-testid="changelog-name">CHANGELOG.md</table.rowcontent>
				<table.rowcontent data-testid="changelog-size">12.4 kB</table.rowcontent>
				<table.rowcontent data-testid="changelog-changed">In March</table.rowcontent>
			</table.item>
		</tbody>
	</table.root>
}
