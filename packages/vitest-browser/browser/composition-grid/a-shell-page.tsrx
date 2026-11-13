import { computed, state } from '@markless/core';
import { ChromeShell } from './chrome-shell.tsrx';
import { EntryTable } from './entry-table.tsrx';
import { loadBoard } from './grid-server.ts';

export default function ShellEntriesPage() @{
	let topic = state('a');
	let version = state(0);
	const entries = computed(async () => await loadBoard(topic, version));

	<section>
		<ChromeShell heading="Entries">
			@try {
				<EntryTable entries={entries} />
			} @pending {
				<span data-g="pending">Loading</span>
			} @catch (problem, retry) {
				<>
					<button type="button" data-grid-reset onClick={() => retry()}>Again</button>
					<p data-g="failed">{problem.message}</p>
				</>
			}
		</ChromeShell>
		<button type="button" data-grid-subject onClick={() => (topic = topic === 'a' ? 'b' : 'a')}>Switch</button>
		<button type="button" data-grid-reload onClick={() => version++}>Again</button>
	</section>
}
