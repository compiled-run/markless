import { computed, state } from '@markless/core';

type Rate = { readonly value: number };

async function rateFor(currency: string, signal: AbortSignal): Promise<Rate> {
	const response = await fetch(`/api/rate?currency=${currency}`, { signal });
	return response.json();
}

function Badge({ currency }: { currency: string }) @{
	const rate = computed(async ({ signal }) => rateFor(currency, signal));

	<span data-badge>
		@try {
			<b>{rate.value}</b>
		} @pending {
			<i>Loading</i>
		}
	</span>
}

// Two async values and two child instances on one page ask the same URL with the same inputs.
export function SameRequest() @{
	let currency = state('EUR');
	const price = computed(async ({ signal }) => {
		const response = await fetch(`/api/rate?currency=${currency}`, { signal });
		return (await response.json()) as Rate;
	});
	const tax = computed(async ({ signal }) => {
		const response = await fetch(`/api/rate?currency=${currency}`, { signal });
		return (await response.json()) as Rate;
	});

	<section>
		<button type="button" data-usd onClick={() => (currency = 'USD')}>USD</button>
		@try {
			<p data-price>{price.value}</p>
		} @pending {
			<p>Loading price</p>
		}
		@try {
			<p data-tax>{tax.value}</p>
		} @pending {
			<p>Loading tax</p>
		}
		<Badge currency={currency} />
		<Badge currency={currency} />
	</section>
}
