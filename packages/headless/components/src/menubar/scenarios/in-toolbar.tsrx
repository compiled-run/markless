import * as menu from '../../menu/index.ts';
import * as menubar from '../index.ts';
import * as toolbar from '../../toolbar/index.ts';

// A whole menu bar standing in a toolbar, beside a lone menu. The bar is one of
// the toolbar's controls - one stop, which hands focus on to its own items - and
// a `menu.trigger` in the same toolbar stays a button that only gives up its stop.
export default function InToolbar() @{
	<section style="padding: 40px">
		<toolbar.root data-testid="root">
			<toolbar.label data-testid="label">Document</toolbar.label>
			<toolbar.item data-testid="print">Print</toolbar.item>
			<menubar.root aria-label="Application" data-testid="bar">
				<menubar.item data-testid="bar-file">
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
					</menubar.itemcontent>
				</menubar.item>
			</menubar.root>
			<menu.root data-testid="menu-share">
				<menu.trigger data-testid="share">Share</menu.trigger>
				<menu.content data-testid="panel-share">
					<menu.item value="link" data-testid="item-link">Copy link</menu.item>
					<menu.item value="email" data-testid="item-email">Email</menu.item>
				</menu.content>
			</menu.root>
			<toolbar.item data-testid="export">Export</toolbar.item>
		</toolbar.root>
	</section>
}
