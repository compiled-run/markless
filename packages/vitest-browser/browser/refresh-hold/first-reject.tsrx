import { computed, state } from '@markless/core';

export function App() @{
	let account = state('closed');
	const balance = computed(async () => {
		const which = account;
		await new Promise((resolve) => setTimeout(resolve, 50));
		if (which === 'closed') throw new Error('Account closed');
		return { amount: 10 };
	});

	<div data-boundary>
		@try {
			<output data-amount>{balance.amount}</output>
		} @pending {
			<p data-pending>Loading</p>
		} @catch (error) {
			<p data-failed>{error.message}</p>
		}
	</div>
}
