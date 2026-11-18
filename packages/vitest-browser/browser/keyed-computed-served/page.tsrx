import { computed, state } from '@markless/core';
import { matchingRows } from './rows-lib.ts';

export function KeyedComputedPage() @{
	const list = state({
		query: 'a',
		rows: [
			{ id: 'r1', label: 'alpha' },
			{ id: 'r2', label: 'beta' },
			{ id: 'r3', label: 'gamma' },
			{ id: 'r4', label: 'delta' },
		],
	});
	let clicks = state(0);
	let open = state(false);
	const shown = computed(() => matchingRows(list.rows, list.query));

	<main>
		<button type="button" data-unrelated onClick={() => {
			clicks = clicks + 1;
			open = !open;
		}}>Unrelated</button>
		<output data-clicks>{clicks}</output>
		@if (open) {
			<p data-open>open</p>
		}
		<button type="button" data-narrow onClick={() => (list.query = 'mm')}>Narrow</button>
		<button type="button" data-widen onClick={() => (list.query = 'e')}>Widen</button>
		<ul data-rows>
			@for (const row of shown; key row.id) {
				<li data-row={row.id}>{row.label}</li>
			}
		</ul>
	</main>
}
