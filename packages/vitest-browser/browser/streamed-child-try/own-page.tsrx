import { computed } from '@markless/core';
import { loadBoard } from '../composition-grid/grid-server.ts';
import { FlagRows } from './flag-rows.tsrx';

export default function StreamedChildTryPage() @{
	const board = computed(async () => await loadBoard('a', 0));

	<main>
		@try {
			<section>
				<h2 data-g="title">{board.title}</h2>
				<FlagRows label="one" />
			</section>
		} @pending {
			<p data-g="pending">Loading</p>
		}
	</main>
}
