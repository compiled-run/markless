import { state } from '@markless/core';
export function Classes() @{
	let active = state(false);
	<section class={active ? 'panel active' : 'panel idle'}><button class={active ? 'toggle on' : 'toggle off'} onClick={() => active = !active}>Toggle</button></section>
}
