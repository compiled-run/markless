import { state } from '@markless/core';
import { collapsible } from '../../index.ts';

export default function WithoutOnChange() @{
	const log = state({ calls: 0 });

	<section>
		<collapsible.root data-testid="root">
			<collapsible.trigger data-testid="trigger">Shipping</collapsible.trigger>
			<collapsible.content data-testid="content">Ships in two days.</collapsible.content>
		</collapsible.root>
		<p data-testid="calls">{log.calls}</p>
	</section>
}
