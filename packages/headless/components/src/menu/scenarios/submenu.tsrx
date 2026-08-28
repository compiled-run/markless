import { state } from '@markless/core';
import { menu } from '../../index.ts';

// A submenu is a `menu.itemcontent` written inside a `menu.item`: one root, one
// `onChange`, and an item marked `submenu` opens it instead of activating.
export default function Submenu() @{
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
				<menu.item value="share" submenu data-testid="sub-item">
					Share
					<menu.itemcontent data-testid="sub-content">
						<menu.item value="email" data-testid="sub-email">Email</menu.item>
						<menu.item value="link" data-testid="sub-link">Copy link</menu.item>
					</menu.itemcontent>
				</menu.item>
				<menu.item value="print" data-testid="item-print">Print</menu.item>
			</menu.content>
		</menu.root>
		<p data-testid="last">{log.last}</p>
	</section>
}
