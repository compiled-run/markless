import { computed, state } from '@markless/core';
import { loadBoard } from './grid-server.ts';
import { SessionBadge } from './session-badge.tsrx';

export default function BadgePage() @{
	let who = state('a');
	let tick = state(0);
	const session = computed(async () => await loadBoard(who, tick));

	<main>
		@try {
			<SessionBadge session={session} />
		} @pending {
			<em data-g="pending">Loading</em>
		} @catch (oops, again) {
			<>
				<button type="button" data-grid-reset onClick={() => again()}>Again</button>
				<em data-g="failed">{oops.message}</em>
			</>
		}
		<button type="button" data-grid-reload onClick={() => tick++}>Tick</button>
		<button type="button" data-grid-subject onClick={() => (who = who === 'a' ? 'b' : 'a')}>Who</button>
	</main>
}
