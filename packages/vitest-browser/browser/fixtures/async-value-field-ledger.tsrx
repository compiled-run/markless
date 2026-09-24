import { computed, state } from '@markless/core';

export function App() @{
	let round = state(1);
	const ledger = computed(async () => {
		const current = round;
		await new Promise((resolve) => setTimeout(resolve, 20));
		return {
			value: `Ledger ${current}`,
			status: `open ${current}`,
			entries: [{ sku: `a${current}` }, { sku: `b${current}` }],
		};
	});

	<article>
		<button type="button" data-next-round onClick={() => round = round + 1}>Next</button>
		@try {
			<h2 data-ledger-value>{ledger.value}</h2>
			<em data-ledger-status>{ledger.status}</em>
			<ul>
				@for (const entry of ledger.entries; key entry.sku) {
					<li data-ledger-entry>{entry.sku}</li>
				}
			</ul>
		} @pending {
			<p data-ledger-wait>Counting</p>
		}
	</article>
}
