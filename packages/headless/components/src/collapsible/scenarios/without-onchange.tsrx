import { state } from '@markless/core';
import * as collapsible from '../index.ts';

// The same page with no `onChange` on the root. The panel still opens and
// closes; the counter beside it stays at zero because nothing was ever called.
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
