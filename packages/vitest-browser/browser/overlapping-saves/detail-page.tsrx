import { computed, state } from '@markless/core';
import { flip, loadBoard, loadDetail } from './server.ts';

export default function DetailPage() @{
	const board = computed(async () => await loadBoard());
	let picked = state('none');
	let open = state(false);
	const detail = computed(async () => await loadDetail(picked));

	<main>
		@try {
			<section>
				<button
					data-pick
					onClick={async () => {
						picked = 'saving';
						await flip('a');
						picked = 'b';
						open = true;
					}}
				>
					Pick
				</button>
				<p data-picked>{picked}</p>
				<p data-count>{board.flags.length}</p>
				@if (open) {
					<p data-detail>{detail.key}</p>
				}
			</section>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
