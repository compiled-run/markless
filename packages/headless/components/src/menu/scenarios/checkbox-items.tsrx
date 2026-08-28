import { state } from '@markless/core';
import { menu } from '../../index.ts';

export default function CheckboxItems() @{
	const log = state({ last: '', calls: 0 });

	<section style="padding: 40px">
		<button type="button" data-testid="background">Background</button>
		<menu.root
			data-testid="root"
			checked={['wrap']}
			onChange={(value: string) => {
				log.last = value;
				log.calls = log.calls + 1;
			}}
		>
			<menu.trigger data-testid="trigger">View</menu.trigger>
			<menu.content data-testid="content">
				<menu.item value="wrap" checked data-testid="item-wrap">Word wrap</menu.item>
				<menu.item value="minimap" checked data-testid="item-minimap">Minimap</menu.item>
				<menu.item value="reload" data-testid="item-reload">Reload</menu.item>
			</menu.content>
		</menu.root>
		<p data-testid="last">{log.last}</p>
		<p data-testid="calls">{log.calls}</p>
	</section>
}
