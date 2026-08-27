import * as menu from '../index.ts';

export default function Basic() @{
	<section style="padding: 40px">
		<button type="button" data-testid="background">Background</button>
		<menu.root data-testid="root">
			<menu.trigger data-testid="trigger">Actions</menu.trigger>
			<menu.content data-testid="content">
				<menu.item value="cut" data-testid="item-cut">Cut</menu.item>
				<menu.item value="copy" data-testid="item-copy">Copy</menu.item>
				<menu.item value="paste" data-testid="item-paste">Paste</menu.item>
				<div role="separator" aria-orientation="horizontal" data-testid="separator"></div>
				<menu.item value="delete" data-testid="item-delete">Delete</menu.item>
			</menu.content>
		</menu.root>
		<a href="/after" data-testid="after">After</a>
	</section>
}
