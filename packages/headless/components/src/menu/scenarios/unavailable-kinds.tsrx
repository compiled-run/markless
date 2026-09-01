import { state } from '@markless/core';
import { menu } from '../../index.ts';

// Every kind of item this family has, one of each unavailable: a plain command,
// a selection item, and a nesting item that drops a submenu. Each kind reaches
// activation down a different path, so each needs its own refusal.
export default function UnavailableKinds() @{
	const log = state({ last: '', calls: 0 });

	<section style="padding: 40px">
		<button type="button" data-testid="background">Background</button>
		<menu.root
			data-testid="root"
			checked={['wrap']}
			delay={40}
			closeDelay={40}
			onChange={(value: string) => {
				log.last = value;
				log.calls = log.calls + 1;
			}}
		>
			<menu.trigger data-testid="trigger">View</menu.trigger>
			<menu.content data-testid="content">
				<menu.item value="wrap" checked data-testid="item-wrap">Word wrap</menu.item>
				<menu.item value="minimap" checked disabled data-testid="item-minimap">Minimap</menu.item>
				<menu.item value="share" submenu disabled data-testid="sub-item">
					Share
					<menu.itemcontent data-testid="sub-content">
						<menu.item value="email" data-testid="sub-email">Email</menu.item>
					</menu.itemcontent>
				</menu.item>
				<menu.item value="print" disabled data-testid="item-print">Print</menu.item>
				<menu.item value="reload" data-testid="item-reload">Reload</menu.item>
			</menu.content>
		</menu.root>
		<p data-testid="last">{log.last}</p>
		<p data-testid="calls">{log.calls}</p>
	</section>
}
