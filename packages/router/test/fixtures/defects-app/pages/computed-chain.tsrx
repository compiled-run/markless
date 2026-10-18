import { computed, state } from '@markless/core';
import { sortRows, windowOf } from '../src/rows.ts';

export default function ComputedChainPage() @{
	let rows = state([3, 1, 2]);
	let key = state(1);
	let top = state(0);
	const shown = computed(() => sortRows(rows, key));
	const win = computed(() => windowOf(shown, top));
	<main>
		<button type="button" data-flip onClick={() => (key = -key)}>
			flip
		</button>
		<button type="button" data-down onClick={() => top++}>
			down
		</button>
		<ul data-window>
			@for (const n of win; key n) {
				<li>{n}</li>;
			}
		</ul>
	</main>;
}
