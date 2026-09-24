import { computed, state } from '@markless/core';

const WORDS = ['amber', 'birch', 'cedar'];

export default function Flips() @{
	let open = state(true);
	let needle = state('');
	const hits = computed(() => WORDS.filter((word) => word.includes(needle)));
	const none = computed(() => hits.length === 0);

	<main>
		<button data-toggle onClick={() => (open = !open)}>Toggle</button>
		@if (open) {
			<p class="on">Shown</p>
		} @else {
			<p class="off">Hidden</p>
		}
		<input data-needle value={needle} onInput={(event) => (needle = (event.target as HTMLInputElement).value)} />
		<ul>
			@for (const word of hits; key word) {
				<li>{word}</li>
			}
		</ul>
		@if (none) {
			<p class="none">Nothing matches {needle}</p>
		}
	</main>
}
