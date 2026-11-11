import { computed, state } from '@markless/core';
import { answer } from '../matched-values/gates.ts';

function money(amount: number, symbol: string): string {
	return `${symbol}${Math.round(amount)}`;
}

function whole(amount: number): string {
	return String(Math.round(amount));
}

export function Sentences() @{
	let days = state(10);
	let symbol = state('€');
	const revenue = computed(async () => {
		const asked = days;
		return answer(`revenue:${asked}`, { total: asked === 10 ? 10_000 : 22_000 });
	});

	<section>
		<button type="button" data-twenty onClick={() => (days = 20)}>20 days</button>
		<button type="button" data-dollar onClick={() => (symbol = '$')}>Dollars</button>
		@try {
			<div data-lines>
				<p data-split>{money(revenue.total / days, symbol)} a day over {days}d</p>
				<p data-joined>{`${money(revenue.total / days, symbol)} a day over ${days}d`}</p>
				<p data-bare>{revenue.total / days} a day</p>
				<p data-wrapped>{whole(revenue.total / days)} a day</p>
			</div>
		} @pending {
			<p data-pending>Loading</p>
		}
	</section>
}
