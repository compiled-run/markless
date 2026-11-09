import { computed, state } from '@markless/core';
import Quote from './quote.tsrx';

export default function Watchlist({ reload }: { reload: number }) @{
	let watched = state(['AAPL']);
	const rows = computed(() => watched.map((symbol) => ({ symbol, reload })));

	<div>
		<button data-add onClick={() => (watched = [...watched, 'NVDA'])}>add</button>
		<ul>
			@for (const row of rows; key row.symbol) {
				<Quote symbol={row.symbol} reload={row.reload} />
			}
		</ul>
	</div>
}
