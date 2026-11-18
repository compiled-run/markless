import { computed, state } from '@markless/core';
import { loadBoard, saveRow } from './grid-server.ts';
import SavingLine from './saving-line.tsrx';
import TitleLine from './title-line.tsrx';

export default function ArmTryPage() @{
	let open = state(true);
	let round = state(0);
	let more = state(false);
	const board = computed(async () => await loadBoard('a', round));

	<main>
		<button type="button" data-grid-open onClick={() => (open = true)}>Open</button>
		<button type="button" data-grid-close onClick={() => (open = false)}>Close</button>
		<button type="button" data-grid-reload onClick={() => round++}>Reload</button>
		@if (open) {
			@try {
				<div>
					<TitleLine title={board.title} />
					<button type="button" data-grid-save onClick={async () => await saveRow('a')}>Save</button>
				</div>
			} @pending {
				<div>
					<p data-g="pending">Loading</p>
					<button type="button" data-more onClick={() => (more = !more)}>More</button>
					@if (more) {
						<SavingLine subject="more" />
					}
				</div>
			}
		}
	</main>
}
