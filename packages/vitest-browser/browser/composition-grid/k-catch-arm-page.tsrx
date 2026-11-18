import { computed, state } from '@markless/core';
import { loadFragileBoard } from './grid-server.ts';
import SavingLine from './saving-line.tsrx';
import TitleLine from './title-line.tsrx';

export default function CatchArmPage() @{
	let more = state(false);
	const board = computed(async () => await loadFragileBoard('a', 0));

	<main>
		@try {
			<TitleLine title={board.title} />
		} @pending {
			<p data-g="pending">Loading</p>
		} @catch (error, reset) {
			<div>
				<p data-g="failed">{error.message}</p>
				<button type="button" data-retry onClick={() => reset()}>Retry</button>
				<button type="button" data-more onClick={() => (more = !more)}>More</button>
				@if (more) {
					<SavingLine subject="more" />
				}
			</div>
		}
	</main>
}
