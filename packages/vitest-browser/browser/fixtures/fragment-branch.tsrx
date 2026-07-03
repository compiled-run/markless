import { state } from '@markless/core';

export function App() @{
	let open = state(true);

	<>
		<button onClick={() => open = !open}>Toggle</button>
		@if (open) {
			<p class="on">Shown</p>
		} @else {
			<p class="off">Hidden</p>
		}
	</>
}
