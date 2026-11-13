import { computed, state } from '@markless/core';
import BoardList from './board-list.tsrx';
import { loadBoard } from './grid-server.ts';
import LayoutFrame from './layout-frame.tsrx';

export default function LayoutListPage() @{
	let subject = state('a');
	let round = state(0);
	const board = computed(async () => await loadBoard(subject, round));

	<div>
		<button type="button" data-grid-reload onClick={() => round++}>Reload</button>
		<button type="button" data-grid-subject onClick={() => (subject = subject === 'a' ? 'b' : 'a')}>Other</button>
		<LayoutFrame>
			@try {
				<BoardList board={board} />
			} @pending {
				<p data-g="pending">Loading</p>
			} @catch (error, reset) {
				<>
					<p data-g="failed">{error.message}</p>
					<button type="button" data-grid-reset onClick={() => reset()}>Retry</button>
				</>
			}
		</LayoutFrame>
	</div>
}
