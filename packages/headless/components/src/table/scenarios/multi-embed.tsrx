import { table } from '../../index.ts';

// One embed's worth of page, mounted twice as two separate islands. The
// unreachable row sits in the middle so the walk has to step past it, and
// `changelog` is last so ArrowDown from there stays here or escapes.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<table.root multiple data-testid="root">
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
				<table.item disabled value="license" data-testid="license-item">
					<table.itemcontent rowheader data-testid="license-name">LICENSE</table.itemcontent>
					<table.itemcontent data-testid="license-size">1.1 kB</table.itemcontent>
				</table.item>
				<table.item value="changelog" data-testid="changelog-item">
					<table.itemcontent rowheader data-testid="changelog-name">CHANGELOG.md</table.itemcontent>
					<table.itemcontent data-testid="changelog-size">12.4 kB</table.itemcontent>
				</table.item>
			</tbody>
		</table.root>
	</section>
}
