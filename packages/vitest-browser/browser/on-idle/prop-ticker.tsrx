import { state } from '@markless/core';

export function Ticker() @{
	let ticks = state(0);

	<p>
		<span data-ticker onIdle={() => ticks++}>ticker</span>
		<output data-ticks>{ticks}</output>
	</p>
}
