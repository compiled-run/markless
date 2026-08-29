import { state } from '@markless/core';
import { gridlist } from '../../index.ts';

// The reason this family exists rather than a list: rows holding controls a
// keyboard can reach. Enter moves focus onto the first one, the arrows step
// between them, Escape brings focus back to the row.
export default function WithWidgets() @{
	const log = state({ pressed: '' });

	<section>
		<gridlist.root data-testid="root">
			<gridlist.label data-testid="label">Files</gridlist.label>
			<gridlist.item value="readme" data-testid="readme-item">
				<gridlist.itemcontent>
					<gridlist.itemlabel data-testid="readme-itemlabel">README.md</gridlist.itemlabel>
					<gridlist.itemtrigger
						data-testid="readme-rename"
						onClick={() => {
							log.pressed = 'readme-rename';
						}}
					>Rename</gridlist.itemtrigger>
					<gridlist.itemtrigger
						data-testid="readme-delete"
						onClick={() => {
							log.pressed = 'readme-delete';
						}}
					>Delete</gridlist.itemtrigger>
				</gridlist.itemcontent>
			</gridlist.item>
			<gridlist.item value="license" data-testid="license-item">
				<gridlist.itemcontent>
					<gridlist.itemlabel data-testid="license-itemlabel">LICENSE</gridlist.itemlabel>
					<gridlist.itemtrigger data-testid="license-rename">Rename</gridlist.itemtrigger>
					<gridlist.itemtrigger data-testid="license-delete">Delete</gridlist.itemtrigger>
				</gridlist.itemcontent>
			</gridlist.item>
			<gridlist.item value="changelog" data-testid="changelog-item">
				<gridlist.itemcontent>
					<gridlist.itemlabel data-testid="changelog-itemlabel">CHANGELOG.md</gridlist.itemlabel>
				</gridlist.itemcontent>
			</gridlist.item>
		</gridlist.root>
		<p data-testid="pressed">{log.pressed}</p>
	</section>
}
