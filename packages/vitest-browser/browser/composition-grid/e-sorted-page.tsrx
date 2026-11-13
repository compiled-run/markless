import { computed, state } from '@markless/core';
import { loadBoard } from './grid-server.ts';
import { SortedEntries } from './sorted-entries.tsrx';

export default function SortedPage() @{
	let topic = state('a');
	let version = state(0);
	const ledger = computed(async () => await loadBoard(topic, version));

	<main>
		@try {
			<SortedEntries ledger={ledger} />
		} @pending {
			<span data-g="pending">Loading</span>
		} @catch (problem, retry) {
			<>
				<button type="button" data-grid-reset onClick={() => retry()}>Again</button>
				<p data-g="failed">{problem.message}</p>
			</>
		}
		<button type="button" data-grid-subject onClick={() => (topic = topic === 'a' ? 'b' : 'a')}>Switch</button>
		<button type="button" data-grid-reload onClick={() => version++}>Again</button>
	</main>
}
