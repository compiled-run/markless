import { computed, state } from '@markless/core';
import { loadBoard } from './grid-server.ts';
import KindCard from './kind-cards.tsrx';

export default function KindPage() @{
	let owner = state('a');
	let pass = state(0);
	const account = computed(async () => await loadBoard(owner, pass));

	<main>
		@try {
			@switch (true) {
				@case account.parity === 'odd': {
					<KindCard account={account} kind="odd" />
				}
				@default: {
					<KindCard account={account} kind="even" />
				}
			}
		} @pending {
			<b data-g="pending">Loading</b>
		} @catch (fault, retry) {
			<>
				<button type="button" data-grid-reset onClick={() => retry()}>Again</button>
				<b data-g="failed">{fault.message}</b>
			</>
		}
		<button type="button" data-grid-subject onClick={() => (owner = owner === 'a' ? 'b' : 'a')}>Owner</button>
		<button type="button" data-grid-reload onClick={() => pass++}>Pass</button>
	</main>
}
