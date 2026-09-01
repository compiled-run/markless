import { menu, menubar } from '../../index.ts';

// One entry on the bar nobody may open. The APG has the arrows land on it and
// refuse to open it, so a person is told the menu exists.
export default function UnavailableItem() @{
	<section style="padding: 40px">
		<menubar.root data-testid="root">
			<menubar.label data-testid="label">Application</menubar.label>
			<menubar.item data-testid="bar-file">
				File
				<menubar.itemcontent data-testid="panel-file">
					<menu.item value="new" data-testid="item-new">New</menu.item>
				</menubar.itemcontent>
			</menubar.item>
			<menubar.item disabled data-testid="bar-edit">
				Edit
				<menubar.itemcontent data-testid="panel-edit">
					<menu.item value="undo" data-testid="item-undo">Undo</menu.item>
				</menubar.itemcontent>
			</menubar.item>
			<menubar.item data-testid="bar-view">
				View
				<menubar.itemcontent data-testid="panel-view">
					<menu.item value="zoom" data-testid="item-zoom">Zoom in</menu.item>
				</menubar.itemcontent>
			</menubar.item>
		</menubar.root>
	</section>
}
