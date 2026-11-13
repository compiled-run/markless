import { computed, state } from '@markless/core';
import { loadBoard } from '../../../../vitest-browser/browser/composition-grid/grid-server.ts';

export default function AppendOnlyPage() @{
	let notes = state<string[]>([]);
	const board = computed(async () => await loadBoard('a', 0));

	<main>
		@try {
			<section>
				<h2 data-g="title" class={board.parity}>{board.title}</h2>
				<button type="button" data-append onClick={async () => { notes = [...notes, `note ${notes.length + 1}`]; }}>Note</button>
				<ul>
					@for (const note of notes; key note) {
						<li data-g="note">{note}</li>
					}
				</ul>
			</section>
		} @pending {
			<p data-g="pending">Loading</p>
		} @catch (error, reset) {
			<>
				<p data-g="failed">{error.message}</p>
				<button type="button" data-grid-reset onClick={() => reset()}>Retry</button>
			</>
		}
	</main>
}
