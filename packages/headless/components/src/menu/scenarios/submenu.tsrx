import { state } from '@markless/core';
import * as menu from '../index.ts';

// A submenu is a nested `menu.root`, written inside the menu it hangs off: it is
// its own instance, so it holds its own open state and takes its own `onChange`.
export default function Submenu() @{
	const log = state({ last: '', sub: '' });

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
				<menu.root
					side="end"
					data-testid="sub-root"
					delay={40}
					closeDelay={40}
					onChange={(value: string) => {
						log.sub = value;
					}}
				>
					<menu.itemtrigger data-testid="sub-trigger">Share</menu.itemtrigger>
					<menu.content data-testid="sub-content">
						<menu.item value="email" data-testid="sub-email">Email</menu.item>
						<menu.item value="link" data-testid="sub-link">Copy link</menu.item>
					</menu.content>
				</menu.root>
				<menu.item value="print" data-testid="item-print">Print</menu.item>
			</menu.content>
		</menu.root>
		<p data-testid="last">{log.last}</p>
		<p data-testid="sub">{log.sub}</p>
	</section>
}
