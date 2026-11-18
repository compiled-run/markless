import { computed } from '@markless/core';
import { loadBoard } from './grid-server.ts';
import StatusForms from './status-forms.tsrx';

export default function StatusFormsPage() @{
	const board = computed(async () => await loadBoard('a', 0));

	<main>
		@try {
			<div>
				<p data-g="title" class={board.parity}>{board.title}</p>
				<StatusForms />
			</div>
		} @pending {
			<p data-g="pending">Loading</p>
		} @catch (error, reset) {
			<>
				<p data-g="failed">{error.message}</p>
				<button type="button" data-grid-reset onClick={() => reset()}>Retry</button>
			</>
		}
	</main>
}
