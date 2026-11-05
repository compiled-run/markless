import { computed, state } from '@markless/core';
import { answer } from './gates.ts';

const rate = (currency: string) => (currency === 'EUR' ? 1 : 1.1);
const span = (period: string) => (period === 'short' ? 10 : 20);

export function Rates() @{
	let currency = state('EUR');
	let period = state('short');
	const sales = computed(async () => answer(`sales:${period}`, { sum: period === 'short' ? 10000 : 30000 }));
	const daily = computed(() => Math.round((sales.sum / span(period)) * rate(currency)));

	<main>
		<button type="button" data-long onClick={() => (period = 'long')}>Long</button>
		<button type="button" data-dollars onClick={() => (currency = 'USD')}>USD</button>
		<span data-unit>{currency}</span>
		@try {
			<strong data-daily>{daily}</strong>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
