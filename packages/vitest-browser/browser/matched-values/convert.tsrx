import { computed, state } from '@markless/core';
import { answer } from './gates.ts';

const days = (window: string) => (window === '1w' ? 10 : 20);

export function Convert() @{
	let window = state('1w');
	let money = state('EUR');
	const income = computed(async () => answer(`income:${window}`, { total: window === '1w' ? 10000 : 30000 }));
	const converted = computed(async () => {
		const total = income.total;
		const count = days(window);
		const unit = money;
		return answer(`convert:${total}:${count}:${unit}`, `${unit === 'EUR' ? '€' : '$'}${Math.round((total / count) * (unit === 'EUR' ? 1 : 1.1))}`);
	});

	<main>
		<button type="button" data-month onClick={() => (window = '1m')}>Month</button>
		<button type="button" data-usd onClick={() => (money = 'USD')}>USD</button>
		<span data-money>{money}</span>
		@try {
			<output data-converted>{converted}</output>
		} @pending {
			<p>Converting</p>
		}
	</main>
}
