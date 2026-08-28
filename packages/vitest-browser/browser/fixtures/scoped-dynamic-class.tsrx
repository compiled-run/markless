import { computed, state } from '@markless/core';

export function App() @{
	let on = state(false);
	let tone = computed(() => on ? 'line lit' : 'line');

	<section>
		<style>
			.line { color: rgb(0, 0, 255); }
			.lit { font-weight: 700; }
		</style>
		<p class="line" data-static>static</p>
		<p class={on ? 'line lit' : 'line'} data-dynamic>dynamic</p>
		<p class={tone} data-plain>plain</p>
		<button type="button" data-toggle onClick={() => on = !on}>toggle</button>
	</section>
}
