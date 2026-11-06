import { computed, state } from '@markless/core';
import { answer } from './gates.ts';

// Two sources fetched for different inputs: profit pins to the newest range both have
// answered, and the source that outran the other serves its kept answer for it.
const revenueTotals = { '10d': 10000, '20d': 30000 } as Record<string, number>;
const costTotals = { '10d': 5000, '20d': 10000 } as Record<string, number>;
const days = (range: string) => (range === '10d' ? 10 : 20);
const rate = (currency: string) => (currency === 'EUR' ? 1 : 1.1);

export function Disagreement() @{
	let range = state('10d');
	let currency = state('EUR');
	const revenue = computed(async () => answer(`dis-revenue:${range}`, { total: revenueTotals[range] }));
	const costs = computed(async () => answer(`dis-costs:${range}`, { total: costTotals[range] }));
	const perDay = computed(() => Math.round((revenue.total / days(range)) * rate(currency)));
	const profit = computed(() => Math.round((revenue.total - costs.total) * rate(currency)));

	<main>
		<button type="button" data-twenty onClick={() => (range = '20d')}>20 days</button>
		<button type="button" data-dollars onClick={() => (currency = 'USD')}>USD</button>
		<span data-unit>{currency}</span>
		@try {
			<p data-per-day>{perDay}</p>
		} @pending {
			<p data-loading>Loading</p>
		}
		@try {
			<p data-profit>{profit}</p>
		} @pending {
			<p data-loading>Loading</p>
		}
	</main>
}
