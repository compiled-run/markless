import { computed, state } from '@markless/core';
import { loadBoard } from '../grid-server.ts';
import ArmPickInner from './arm-pick-inner.tsrx';

export default function ArmPickMiddle() @{
	let subject = state('a');
	let round = state(0);
	let picks = state(0);
	const board = computed(async () => await loadBoard(subject, round));

	<div>
		<button type="button" data-grid-reload onClick={() => round++}>Reload</button>
		<button type="button" data-grid-subject onClick={() => (subject = subject === 'a' ? 'b' : 'a')}>Other</button>
		<p data-g="picks">{picks}</p>
		@try {
			<ArmPickInner board={board} onPick={() => picks++} />
		} @pending {
			<p data-g="pending">Loading</p>
		}
	</div>
}
