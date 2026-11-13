import { computed, state } from '@markless/core';
import { EntryNote } from './entry-note.tsrx';
import { failSave, loadBoard, saveRow } from './grid-server.ts';

export default function EntryNotePage() @{
	let topic = state('a');
	let version = state(0);
	const ledger = computed(async () => await loadBoard(topic, version));

	<main>
		@try {
			<div>
				<button type="button" data-grid-fail onClick={async () => await failSave(ledger.subject)}>Try</button>
				@for (const entry of ledger.items; key entry.id) {
					<EntryNote entry={entry} />
				}
				<h3 class={ledger.parity} data-g="title">{ledger.title}</h3>
				<button type="button" data-grid-save onClick={async () => await saveRow(ledger.subject)}>Keep</button>
			</div>
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
