import { state } from '@markless/core';
import { menu } from '../../index.ts';

// Three levels of the same two parts. Every `menu.item` roots its own item
// instance, so the depth is only how deep the markup goes - there is no second
// root and no `sub*` part anywhere in it.
export default function Deep() @{
	const log = state({ last: '' });

	<section style="padding: 40px">
		<button type="button" data-testid="background">Background</button>
		<menu.root
			data-testid="root"
			delay={40}
			closeDelay={40}
			onChange={(value: string) => {
				log.last = value;
			}}
		>
			<menu.trigger data-testid="trigger">File</menu.trigger>
			<menu.content data-testid="content">
				<menu.item value="new" data-testid="item-new">New</menu.item>
				<menu.item value="share" submenu data-testid="level-1">
					Share
					<menu.itemcontent data-testid="content-1">
						<menu.item value="email" data-testid="item-email">Email</menu.item>
						<menu.item value="social" submenu data-testid="level-2">
							Social
							<menu.itemcontent data-testid="content-2">
								<menu.item value="mastodon" data-testid="item-mastodon">Mastodon</menu.item>
								<menu.item value="bluesky" data-testid="item-bluesky">Bluesky</menu.item>
							</menu.itemcontent>
						</menu.item>
					</menu.itemcontent>
				</menu.item>
				<menu.item value="print" data-testid="item-print">Print</menu.item>
			</menu.content>
		</menu.root>
		<p data-testid="last">{log.last}</p>
	</section>
}
