import { computed, state } from '@markless/core';
import { answer } from './gates.ts';

const totals = { '10d': 10000, '20d': 30000 } as Record<string, number>;
const costTotals = { '10d': 5000, '20d': 10000 } as Record<string, number>;
const days = (range: string) => (range === '10d' ? 10 : 20);

export function Revenue() @{
	let range = state('10d');
	const revenue = computed(async () => answer(`revenue:${range}`, { total: totals[range] }));
	const costs = computed(async () => answer(`costs:${range}`, { total: costTotals[range] }));
	const perDay = computed(() => revenue.total / days(range));
	const profit = computed(() => revenue.total - costs.total);

	<main>
		<button type="button" data-twenty onClick={() => (range = '20d')}>20 days</button>
		<span data-range>{range}</span>
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
		@try {
			<p data-inline>{revenue.total / days(range)}</p>
		} @pending {
			<p data-loading>Loading</p>
		}
	</main>
}
