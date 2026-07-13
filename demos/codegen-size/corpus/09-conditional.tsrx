import { state } from '@markless/core';
export function Conditional() @{
	let open = state(true);
	<section><button onClick={() => open = !open}>Toggle</button>@if (open) { <p class="open">Shown</p> } @else { <p class="closed">Hidden</p> }</section>
}
