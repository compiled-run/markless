import { computed, state } from '@markless/core';
import { sortRows, windowOf } from './rows.ts';

export default function ComputedChainPage() @{
	let rows = state([3, 1, 2]);
	let key = state(1);
	let top = state(0);
	const shown = computed(() => sortRows(rows, key));
	const win = computed(() => windowOf(shown, top));
	const ordered = computed(() => rows.slice().sort((a, b) => (a - b) * key));
	const firstTwo = computed(() => ordered.slice(top, top + 2));
	const label = computed(() => firstTwo.join('-'));
	let seen = state('');
	<main>
		<button type="button" data-flip onClick={() => (key = -key)}>
			flip
		</button>
		<button type="button" data-down onClick={() => top++}>
			down
		</button>
		<button type="button" data-peek onClick={() => (seen = firstTwo.join(','))}>
			peek
		</button>
		<ul data-window>
			@for (const n of win; key n) {
				<li>{n}</li>;
			}
		</ul>
		<p data-label>{label}</p>
		<p data-seen>{seen}</p>
	</main>;
}
