import { computed, state } from '@markless/core';
import BoardList from '../../../../vitest-browser/browser/composition-grid/board-list.tsrx';
import { loadBoard } from '../../../../vitest-browser/browser/composition-grid/grid-server.ts';

export function Banner() @{
	<header>Boards</header>
}

export function SecondExportPage() @{
	let subject = state('a');
	let round = state(0);
	const board = computed(async () => await loadBoard(subject, round));

	<div>
		<Banner />
		<button type="button" data-grid-reload onClick={() => round++}>Reload</button>
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
	</div>
}
