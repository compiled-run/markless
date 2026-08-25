import { state } from '@markless/core';

export function App() @{
	let on = state(false);

	<section>
		<style>
			.line { color: rgb(0, 0, 255); }
			.lit { font-weight: 700; }
		</style>
		<p class="line" data-static>static</p>
		<p class={on ? 'line lit' : 'line'} data-dynamic>dynamic</p>
		<button type="button" data-toggle onClick={() => on = !on}>toggle</button>
	</section>
}
