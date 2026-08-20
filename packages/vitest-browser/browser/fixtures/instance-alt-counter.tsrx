import { state } from '@markless/core';

// Declares the SAME state name as InstanceCounter on purpose: composing two
// different components that both name their state `steps` must not collide.
export function InstanceAltCounter() @{
	let steps = state(0);
	<output data-alt-counter onClick={() => { steps += 2; }}>{steps}</output>
}
