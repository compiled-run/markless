import * as menu from '../index.ts';

// The refusal, as a page: a menubar has no trigger, and the trigger is the only
// part that can say so - a component cannot see its own children.
export default function MenubarTrigger() @{
	<section style="padding: 40px">
		<menu.root menubar aria-label="Application" data-testid="root">
			<menu.trigger data-testid="trigger">File</menu.trigger>
			<menu.item value="file" submenu data-testid="bar-file">
				File
				<menu.itemcontent data-testid="panel-file">
					<menu.item value="new" data-testid="item-new">New</menu.item>
				</menu.itemcontent>
			</menu.item>
		</menu.root>
	</section>
}
