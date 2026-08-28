import * as menu from '../../menu/index.ts';
import * as menubar from '../index.ts';

// Two bars and a loose menu, which is the qualification measured from both ends:
// each menu registers in the bar its own `menubarState()` read resolved to, and a
// menu standing outside every bar resolves to no instance at all.
export default function TwoBars() @{
	<section style="padding: 40px">
		<menubar.root aria-label="Document" data-testid="first-root">
			<menu.root data-testid="menu-file">
				<menu.trigger data-testid="file">File</menu.trigger>
				<menu.content data-testid="panel-file">
					<menu.item value="new" data-testid="item-new">New</menu.item>
				</menu.content>
			</menu.root>
			<menu.root data-testid="menu-edit">
				<menu.trigger data-testid="edit">Edit</menu.trigger>
				<menu.content data-testid="panel-edit">
					<menu.item value="undo" data-testid="item-undo">Undo</menu.item>
				</menu.content>
			</menu.root>
		</menubar.root>

		<menubar.root aria-label="Table" data-testid="second-root">
			<menu.root data-testid="menu-row">
				<menu.trigger data-testid="row">Row</menu.trigger>
				<menu.content data-testid="panel-row">
					<menu.item value="insert-row" data-testid="item-insert-row">Insert</menu.item>
				</menu.content>
			</menu.root>
			<menu.root data-testid="menu-column">
				<menu.trigger data-testid="column">Column</menu.trigger>
				<menu.content data-testid="panel-column">
					<menu.item value="insert-column" data-testid="item-insert-column">Insert</menu.item>
				</menu.content>
			</menu.root>
		</menubar.root>

		<menu.root data-testid="menu-loose">
			<menu.trigger data-testid="loose">Actions</menu.trigger>
			<menu.content data-testid="panel-loose">
				<menu.item value="cut" data-testid="item-cut">Cut</menu.item>
			</menu.content>
		</menu.root>
	</section>
}
