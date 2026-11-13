import { state } from '@markless/core';
import type { Board } from './grid-server.ts';
import ListingRows from './listing-rows.tsrx';

export default function RowTabs({ board }: { board: Board }) @{
	let tab = state('list');

	<section>
		<h2 data-g="title" class={board.parity}>{board.title}</h2>
		<button type="button" data-grid-open onClick={() => (tab = 'list')}>List</button>
		<button type="button" data-grid-close onClick={() => (tab = 'summary')}>Summary</button>
		@if (tab === 'summary') {
			<p data-g="closed">Summary</p>
		} @else {
			<ListingRows board={board} />
		}
	</section>
}
