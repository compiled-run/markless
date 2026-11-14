import { computed, state } from '@markless/core';
import { loadBoard, saveRow } from './grid-server.ts';
import SavingLine from './saving-line.tsrx';

export default function SavingArmPage() @{
	let sending = state<string | null>(null);
	const board = computed(async () => await loadBoard('a', 0));

	<main>
		@try {
			<section>
				<h2 data-g="title" class={board.parity}>{board.title}</h2>
				<ul>
					@for (const row of board.items; key row.id) {
						<li data-g="row">{row.label}</li>
					}
					@if (sending !== null) {
						<SavingLine subject={sending} />
					}
				</ul>
				<button
					type="button"
					data-grid-save
					onClick={async () => {
						sending = board.subject;
						try {
							await saveRow(board.subject);
						} finally {
							sending = null;
						}
					}}
				>
					Save
				</button>
			</section>
		} @pending {
			<p data-g="pending">Loading</p>
		}
	</main>
}
