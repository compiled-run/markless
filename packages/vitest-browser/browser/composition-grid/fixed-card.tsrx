import { computed } from '@markless/core';
import { failSave, loadBoard, saveRow } from './grid-server.ts';

export default function FixedCard() @{
	const board = computed(async () => await loadBoard('a', 0));

	@try {
		<article>
			<p data-g="title" class={board.parity}>{board.title}</p>
			<button type="button" data-grid-save onClick={async () => await saveRow(board.subject)}>Save</button>
			<button type="button" data-grid-fail onClick={async () => await failSave(board.subject)}>Fail</button>
		</article>
	} @pending {
		<p data-g="pending">Loading in child</p>
	} @catch (error, reset) {
		<>
			<p data-g="failed">{error.message}</p>
			<button type="button" data-grid-reset onClick={() => reset()}>Retry</button>
		</>
	}
}
