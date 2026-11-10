import { computed, state } from '@markless/core';
import { ledger } from './statement-ledger.ts';

export function Statement() @{
	let month = state('may');
	const statement = computed(async () => {
		const which = month;
		await new Promise((resolve) => setTimeout(resolve, 20));
		if (ledger.down.has(which)) throw new Error('Ledger offline for ' + which);
		return { title: 'Statement for ' + which };
	});

	<main>
		<button type="button" data-june onClick={() => (month = 'june')}>June</button>
		<article data-boundary>
			@try {
				<h3 data-title>{statement.title}</h3>
			} @pending {
				<p data-pending>Loading</p>
			} @catch (problem, retry) {
				<>
					<em data-problem>{problem.message}</em>
					<button type="button" data-retry onClick={retry}>Retry</button>
				</>
			}
		</article>
	</main>
}
