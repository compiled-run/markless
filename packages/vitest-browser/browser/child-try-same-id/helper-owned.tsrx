import { computed, state } from '@markless/core';
import { answer } from './answers.ts';

function Tally() @{
	let count = state(5);

	<button type="button" data-tally onClick={() => count++}>{count}</button>
}

function Card() @{
	let round = state(1);
	const label = computed(async () => {
		const at = await answer(round);
		if (at === 1) throw new Error('refused');
		return `card ${at}`;
	});

	<section>
		<button type="button" data-card-more onClick={() => round++}>Card</button>
		@try {
			<div>
				<p data-card>{label}</p>
				<Tally />
			</div>
		} @pending {
			<p data-loading>Loading</p>
		} @catch (error, reset) {
			<p data-card>
				{error.message}
				<button type="button" data-card-retry onClick={() => reset()}>Retry</button>
			</p>
		}
	</section>
}

export default function HelperOwned() @{
	<main>
		<Card />
	</main>
}
