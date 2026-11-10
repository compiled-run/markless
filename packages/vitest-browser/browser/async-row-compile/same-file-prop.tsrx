import { computed, state } from '@markless/core';
import { getQuote } from './gate.ts';

function Price({ round }: { round: number }) @{
	const quote = computed(async () => {
		const asked = round;
		return await getQuote(asked);
	});

	@try {
		<p data-price>{quote.label}: {quote.price}</p>
	} @pending {
		<p data-price-loading>Loading</p>
	}
}

export default function SameFileProp() @{
	let round = state(0);

	<main>
		<button data-bump aria-pressed={round > 0} onClick={() => round++}>{round}</button>
		<Price round={round} />
	</main>
}
