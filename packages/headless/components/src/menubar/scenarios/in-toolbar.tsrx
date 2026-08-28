import * as menu from '../../menu/index.ts';
import * as toolbar from '../../toolbar/index.ts';

// The other bar a menu can stand in. A toolbar collapses its controls' tab stops
// and changes nothing else, so the trigger stays a button; only a menubar turns
// it into a menu item.
export default function InToolbar() @{
	<section style="padding: 40px">
		<toolbar.root data-testid="root">
			<toolbar.label data-testid="label">Document</toolbar.label>
			<toolbar.item data-testid="print">Print</toolbar.item>
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
