import { state } from '@markless/core';
import type { Board } from './grid-server.ts';
import ListingCache from './listing-cache.tsrx';

export default function ApproachTabs({ board }: { board: Board }) @{
	let tab = state('list');

	<section>
		<h2 data-g="title" class={board.parity}>{board.title}</h2>
		<button type="button" data-grid-open onClick={() => (tab = 'list')}>List</button>
		<button type="button" data-grid-close onClick={() => (tab = 'summary')}>Summary</button>
		@if (tab === 'summary') {
			<p data-g="closed">Summary</p>
		} @else {
			<ListingCache board={board} />
		}
	</section>
}
