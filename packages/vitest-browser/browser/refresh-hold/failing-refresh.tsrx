import { computed, state } from '@markless/core';

export function App() @{
	let account = state('ok');
	const balance = computed(async () => {
		const which = account;
		await new Promise((resolve) => setTimeout(resolve, which === 'ok' ? 10 : 300));
		if (which === 'closed') throw new Error('Account closed');
		return { amount: which === 'ok' ? 10 : 20 };
	});

	<main>
		<button type="button" data-close onClick={() => (account = 'closed')}>Close</button>
		<div data-boundary>
			@try {
				<output data-amount>{balance.amount}</output>
			} @pending {
				<p data-pending>Loading</p>
			} @catch (error) {
				<p data-failed>{error.message}</p>
			}
		</div>
	</main>
}
