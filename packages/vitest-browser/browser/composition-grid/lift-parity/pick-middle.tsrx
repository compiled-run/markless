import { computed, state } from '@markless/core';
import { loadBoard } from '../grid-server.ts';
import PickInner from './pick-inner.tsrx';

export default function PickMiddle() @{
	let subject = state('a');
	let round = state(0);
	let picked = state('none');
	const board = computed(async () => await loadBoard(subject, round));

	<div>
		<button type="button" data-grid-reload onClick={() => round++}>Reload</button>
		<button type="button" data-grid-subject onClick={() => (subject = subject === 'a' ? 'b' : 'a')}>Other</button>
		<p data-g="picked">{picked}</p>
		@try {
			<PickInner board={board} onPick={(id) => (picked = id)} />
		} @pending {
			<p data-g="pending">Loading</p>
		}
	</div>
}
