import { computed, state } from '@markless/core';
import { loadBoard } from './grid-server.ts';
import { EvenCard, OddCard } from './parity-card.tsrx';

export default function SwitchPage() @{
	let subject = state('a');
	let round = state(0);
	const board = computed(async () => await loadBoard(subject, round));

	<div>
		<button type="button" data-grid-reload onClick={() => round++}>Reload</button>
		<button type="button" data-grid-subject onClick={() => (subject = subject === 'a' ? 'b' : 'a')}>Other</button>
		@try {
			@switch (board.parity) {
				@case 'even': {
					<EvenCard board={board} />
				}
				@case 'odd': {
					<OddCard board={board} />
				}
			}
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
