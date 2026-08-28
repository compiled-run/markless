import { menu, menubar } from '../../index.ts';


// The bar with the menu family's stock 700 ms hover intent, and one item served
// already open. The stock delay is what proves the bar's hover-after-open never
// consults it: only a nested submenu does. It is also the page the served rows
// wake, so the first gesture on it is cold.
export default function ServedOpen() @{
	<section style="padding: 40px">
		<button type="button" data-testid="background">Background</button>
		<menubar.root aria-label="Application" data-testid="root">
			<menubar.item data-testid="bar-file" open>
				File
				<menubar.itemcontent data-testid="panel-file">
					<menu.item value="new" data-testid="item-new">New</menu.item>
					<menu.item value="open" data-testid="item-open">Open</menu.item>
				</menubar.itemcontent>
			</menubar.item>
			<menubar.item data-testid="bar-edit">
				Edit
				<menubar.itemcontent data-testid="panel-edit">
					<menu.item value="undo" data-testid="item-undo">Undo</menu.item>
					<menu.item value="redo" data-testid="item-redo">Redo</menu.item>
				</menubar.itemcontent>
			</menubar.item>
			<menubar.item data-testid="bar-view">
				View
				<menubar.itemcontent data-testid="panel-view">
					<menu.item value="wrap" data-testid="item-wrap">Word wrap</menu.item>
					<menu.item value="zoom" data-testid="item-zoom">Zoom in</menu.item>
				</menubar.itemcontent>
			</menubar.item>
		</menubar.root>
	</section>
}
