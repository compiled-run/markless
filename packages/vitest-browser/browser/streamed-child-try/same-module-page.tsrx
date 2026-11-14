import { computed } from '@markless/core';
import { loadBoard } from '../composition-grid/grid-server.ts';
import { FlagNestSameModule } from './same-module-nest.tsrx';

export default function StreamedChildTrySameModulePage() @{
	const board = computed(async () => await loadBoard('a', 0));

	<main>
		@try {
			<section>
				<h2 data-g="title">{board.title}</h2>
				<FlagNestSameModule label="outer" />
			</section>
		} @pending {
			<p data-g="pending">Loading</p>
		}
	</main>
}
