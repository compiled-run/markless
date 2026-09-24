import { computed } from '@markless/core';

export default function LedgerPage() @{
	const ledger = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 10));
		return { value: 'Ledger route', status: 'open route', entries: [{ sku: 'r1' }, { sku: 'r2' }] };
	});

	<main data-ledger-page>
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
	</main>
}
