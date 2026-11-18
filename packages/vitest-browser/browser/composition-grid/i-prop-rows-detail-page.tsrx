import { computed, state } from '@markless/core';
import DetailRowsTable from './detail-rows-table.tsrx';
import { loadBoard } from './grid-server.ts';

export default function PropRowsDetailPage() @{
	let subject = state('a');
	let round = state(0);
	const board = computed(async () => await loadBoard(subject, round));

	<div>
		<button type="button" data-grid-reload onClick={() => round++}>Reload</button>
		<button type="button" data-grid-subject onClick={() => (subject = subject === 'a' ? 'b' : 'a')}>Other</button>
		@try {
			<DetailRowsTable board={board} />
		} @pending {
			<p data-g="pending">Loading</p>
		} @catch (error, reset) {
			<>
				<p data-g="failed">{error.message}</p>
				<button type="button" data-grid-reset onClick={() => reset()}>Retry</button>
			</>
		}
	</div>
}
