import { menu, menubar } from '../../index.ts';


// Two bars and a loose menu, which is the qualification measured from both ends:
// each item walks only the bar its own `menubarState()` read resolved to, and a
// menu standing outside every bar is untouched by the family.
export default function TwoBars() @{
	<section style="padding: 40px">
		<menubar.root aria-label="Document" data-testid="first-root">
			<menubar.item data-testid="file">
				File
				<menubar.itemcontent data-testid="panel-file">
					<menu.item value="new" data-testid="item-new">New</menu.item>
				</menubar.itemcontent>
			</menubar.item>
			<menubar.item data-testid="edit">
				Edit
				<menubar.itemcontent data-testid="panel-edit">
					<menu.item value="undo" data-testid="item-undo">Undo</menu.item>
				</menubar.itemcontent>
			</menubar.item>
		</menubar.root>

		<menubar.root aria-label="Table" data-testid="second-root">
			<menubar.item data-testid="row">
				Row
				<menubar.itemcontent data-testid="panel-row">
					<menu.item value="insert-row" data-testid="item-insert-row">Insert</menu.item>
				</menubar.itemcontent>
			</menubar.item>
			<menubar.item data-testid="column">
				Column
				<menubar.itemcontent data-testid="panel-column">
					<menu.item value="insert-column" data-testid="item-insert-column">Insert</menu.item>
				</menubar.itemcontent>
			</menubar.item>
		</menubar.root>

		<menu.root data-testid="menu-loose">
			<menu.trigger data-testid="loose">Actions</menu.trigger>
			<menu.content data-testid="panel-loose">
				<menu.item value="cut" data-testid="item-cut">Cut</menu.item>
			</menu.content>
		</menu.root>
	</section>
}
