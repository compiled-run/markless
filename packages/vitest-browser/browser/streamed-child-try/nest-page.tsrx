import { computed } from '@markless/core';
import { loadBoard } from '../composition-grid/grid-server.ts';
import { FlagNest } from './flag-nest.tsrx';

export default function StreamedChildTryNestPage() @{
	const board = computed(async () => await loadBoard('a', 0));

	<main>
		@try {
			<section>
				<h2 data-g="title">{board.title}</h2>
				<FlagNest label="outer" />
			</section>
		} @pending {
			<p data-g="pending">Loading</p>
		}
	</main>
}
