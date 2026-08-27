import * as menu from '../index.ts';

// A focusable row inside the region: Shift+F10 and the ContextMenu key open the
// menu at the row's own box, and Escape hands focus back to the row.
export default function ContextKeyboard() @{
	<section style="padding: 40px">
		<button type="button" data-testid="background">Background</button>
		<menu.root data-testid="root">
			<menu.contextarea data-testid="area">
				<div tabindex={0} data-testid="row">report.pdf</div>
			</menu.contextarea>
			<menu.content data-testid="content" aria-label="File actions">
				<menu.item value="open" data-testid="item-open">Open</menu.item>
				<menu.item value="rename" data-testid="item-rename">Rename</menu.item>
			</menu.content>
		</menu.root>
		<a href="/after" data-testid="after">After</a>
	</section>
}
