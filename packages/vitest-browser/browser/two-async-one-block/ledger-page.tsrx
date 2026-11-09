import { computed } from '@markless/core';

export default function LedgerPage() @{
	const account = computed(async () => ({ owner: 'Lin' }));
	const balance = computed(async () => {
		await Promise.resolve();
		throw new Error('ledger offline');
	});
	<article>
		@try {
			<dl>
				<dt data-owner>{account.owner}</dt>
				<dd data-balance>{balance.total}</dd>
			</dl>
		} @pending {
			<p>Counting</p>
		} @catch (error) {
			<p data-failure>{error.message}</p>
		}
	</article>
}
