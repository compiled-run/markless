import { computed, state } from '@markless/core';
import { loadBoard } from '../grid-server.ts';
import ModeInner from './mode-inner.tsrx';

export default function ModeRelayMiddle({ mode }: { mode: string }) @{
	let subject = state('a');
	let round = state(0);
	const board = computed(async () => await loadBoard(subject, round));

	<div>
		<button type="button" data-grid-reload onClick={() => round++}>Reload</button>
		<button type="button" data-grid-subject onClick={() => (subject = subject === 'a' ? 'b' : 'a')}>Other</button>
		@try {
			<ModeInner mode={mode} board={board} />
		} @pending {
			<p data-g="pending">Loading</p>
		}
	</div>
}
