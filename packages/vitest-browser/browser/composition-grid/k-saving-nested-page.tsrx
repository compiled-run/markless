import { computed, state } from '@markless/core';
import { failSave, loadBoard, saveRow } from './grid-server.ts';
import SavingLine from './saving-line.tsrx';

export default function SavingNestedPage() @{
	let sending = state<string | null>(null);
	let notes = state<string[]>([]);
	const board = computed(async () => await loadBoard('a', 0));

	<main>
		@try {
			<section>
				<h2 data-g="title" class={board.parity}>{board.title}</h2>
				@try {
					<ul>
						@for (const row of board.items; key row.id) {
							<li data-g="row">{row.label}</li>
						}
						@if (sending !== null) {
							<SavingLine subject={sending} />
						}
					</ul>
				} @pending {
					<p data-g="pending">Loading rows</p>
				}
				<ol>
					@for (const note of notes; key note) {
						<li data-g="note">{note}</li>
					}
				</ol>
				<button
					type="button"
					data-grid-save
					onClick={async () => {
						sending = board.subject;
						notes = [...notes, `note ${notes.length + 1}`];
						try {
							await saveRow(board.subject);
						} finally {
							sending = null;
						}
					}}
				>
					Save
				</button>
				<button type="button" data-grid-fail onClick={async () => await failSave(board.subject)}>Fail</button>
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
