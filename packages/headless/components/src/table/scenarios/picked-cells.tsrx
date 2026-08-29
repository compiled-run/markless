import { state } from '@markless/core';
import { table } from '../../index.ts';

// Cells and selection together: the arrows walk cells, and the space bar picks
// the row the focused cell sits in - a cell is never itself selectable.
export default function PickedCells() @{
	const log = state({ picked: '' });

	<section>
		<table.root
			multiple
			data-testid="root"
			onChange={(next: readonly string[]) => {
				log.picked = next.join(' ');
			}}
		>
			<caption>Files</caption>
			<thead>
				<tr>
					<th>Name</th>
					<th>Size</th>
				</tr>
			</thead>
			<tbody>
				<table.item value="readme" data-testid="readme-item">
					<table.rowcontent rowheader data-testid="readme-name">README.md</table.rowcontent>
					<table.rowcontent data-testid="readme-size">4.1 kB</table.rowcontent>
				</table.item>
				<table.item value="license" data-testid="license-item">
					<table.rowcontent rowheader data-testid="license-name">LICENSE</table.rowcontent>
					<table.rowcontent data-testid="license-size">1.1 kB</table.rowcontent>
				</table.item>
				<table.item value="changelog" data-testid="changelog-item">
					<table.rowcontent rowheader data-testid="changelog-name">CHANGELOG.md</table.rowcontent>
					<table.rowcontent data-testid="changelog-size">12.4 kB</table.rowcontent>
				</table.item>
			</tbody>
		</table.root>
		<p data-testid="picked">{log.picked}</p>
	</section>
}
