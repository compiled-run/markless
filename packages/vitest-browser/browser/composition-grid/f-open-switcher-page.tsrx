import { computed, state } from '@markless/core';
import { loadBoard } from './grid-server.ts';
import { OpenViewSwitcher } from './f-open-view-switcher.tsrx';

export default function OpenSwitcherPage() @{
	let team = state('a');
	let turn = state(0);
	const roster = computed(async () => await loadBoard(team, turn));

	<main>
		@try {
			<OpenViewSwitcher roster={roster} />
		} @pending {
			<span data-g="pending">Loading</span>
		} @catch (problem, retry) {
			<>
				<button type="button" data-grid-reset onClick={() => retry()}>Again</button>
				<p data-g="failed">{problem.message}</p>
			</>
		}
		<button type="button" data-grid-subject onClick={() => (team = team === 'a' ? 'b' : 'a')}>Team</button>
		<button type="button" data-grid-reload onClick={() => turn++}>Turn</button>
	</main>
}
