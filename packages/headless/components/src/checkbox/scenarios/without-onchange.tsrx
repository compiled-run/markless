import { state } from '@markless/core';
import { checkbox } from '../../index.ts';

export default function WithoutOnChange() @{
	const log = state({ calls: 0 });

	<section>
		<checkbox.root data-testid="root">
			<checkbox.trigger data-testid="trigger"><checkbox.indicator data-testid="indicator">Checked</checkbox.indicator></checkbox.trigger>
		</checkbox.root>
		<p data-testid="calls">{log.calls}</p>
	</section>
}
