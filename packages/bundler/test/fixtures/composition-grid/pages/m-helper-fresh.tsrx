import { computed, state } from '@markless/core';
import { loadBoard } from '../../../../../vitest-browser/browser/composition-grid/grid-server.ts';

function Tally() @{
	let count = state(5);

	<button type="button" data-g="tally" data-tally onClick={() => count++}>{count}</button>
}

// A helper in the page's own module owns the @try; its first answer is refused, so the child the retried arm places is new.
function Card() @{
	let round = state(0);
	const board = computed(async () => {
		if (round === 0) throw new Error('refused');
		return await loadBoard('a', round);
	});

	<section>
		<button type="button" data-grid-reload onClick={() => round++}>Reload</button>
		@try {
			<div>
				<h2 data-g="title">{board.title}</h2>
				<Tally />
			</div>
		} @pending {
			<p data-g="pending">Loading</p>
		} @catch (error, reset) {
			<>
				<p data-g="failed">{error.message}</p>
				<button type="button" data-grid-reset onClick={() => reset()}>Retry</button>
			</>
		}
	</section>
}

export default function Page() @{
	<main>
		<Card />
	</main>
}
