import { state } from '@markless/core';

export function InstanceCounter() @{
	let steps = state(0);
	<button type="button" data-counter onClick={() => { steps++; }}>{steps}</button>
}
