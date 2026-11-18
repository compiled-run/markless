import { computed, state } from '@markless/core';
import { getQuote } from './gate.ts';

export default function Quote({ symbol, reload }: { symbol: string; reload: number }) @{
	let round = state(0);
	const price = computed(async () => await getQuote(symbol, reload, round));

	<li data-symbol={symbol}>
		@try {
			<span data-price>{price}</span>
		} @pending {
			<span>wait</span>
		}
		<button data-again onClick={() => round++}>again</button>
	</li>
}
