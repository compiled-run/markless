import { table } from '../../index.ts';

// A table nobody may use: it leaves the tab order and nothing in it can be picked.
export default function Disabled() @{
	<table.root multiple disabled data-testid="root">
		<caption>Files</caption>
		<thead>
			<tr>
				<th>Name</th>
				<th>Size</th>
			</tr>
		</thead>
		<tbody>
			<table.item value="readme" data-testid="readme-item">
				<table.itemcontent rowheader data-testid="readme-name">README.md</table.itemcontent>
				<table.itemcontent data-testid="readme-size">4.1 kB</table.itemcontent>
			</table.item>
			<table.item value="license" data-testid="license-item">
				<table.itemcontent rowheader data-testid="license-name">LICENSE</table.itemcontent>
				<table.itemcontent data-testid="license-size">1.1 kB</table.itemcontent>
			</table.item>
		</tbody>
	</table.root>
}
