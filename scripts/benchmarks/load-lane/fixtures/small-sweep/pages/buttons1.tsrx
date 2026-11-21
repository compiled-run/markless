import { computed, state } from '@markless/core';
import { loadCard } from '../src/card.ts';

// A streamed card and 1 buttons outside any list, each with its own state.
export default function Page() @{
	let c0 = state(0);
	const card = computed(async () => loadCard());

	<main>
		@try {
			<p class="card">{card.title}: {card.total}</p>
		} @pending {
			<p class="card">Loading</p>
		}
		<div class="buttons">
			<button class="b b0" onClick={() => c0++}>Button 0: {c0}</button>
		</div>
	</main>
}
