import { computed, state } from '@markless/core';
import { answer } from './gates.ts';

export function Share() @{
	let span = state('10d');
	let attempt = state(0);
	let shared = state('nothing');
	const revenue = computed(async () => {
		const tries = attempt;
		return answer(`revenue:${span}:${tries}`, { total: span === '10d' ? 10000 : 30000 });
	});
	const perDay = computed(() => revenue.total / (span === '10d' ? 10 : 20));

	<main>
		<button type="button" data-span onClick={() => (span = '20d')}>20 days</button>
		<button type="button" data-again onClick={() => (attempt = attempt + 1)}>Ask again</button>
		<button type="button" data-share onClick={() => (shared = `${perDay} a day over ${span}`)}>Share</button>
		<output data-shared>{shared}</output>
		@try {
			<p data-figure>{perDay}</p>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
