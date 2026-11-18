import { computed, state } from '@markless/core';
import { loadBoard } from '../composition-grid/grid-server.ts';
import { FlagRows } from './flag-rows.tsrx';

export default function StreamedListChildTryPage() @{
	const board = computed(async () => await loadBoard('a', 0));
	let dropped = state<ReadonlyArray<string>>([]);
	const rows = computed(() => board.items.filter((item) => !dropped.includes(item.id)));

	<main>
		@try {
			<section>
				<h2 data-g="title">{board.title}</h2>
				<ul>
					@for (const item of rows; key item.id) {
						<li>
							<span data-g="row">{item.label}</span>
							<button type="button" data-drop={item.id} onClick={() => (dropped = [...dropped, item.id])}>Drop</button>
						</li>
					}
				</ul>
				<FlagRows label="one" />
			</section>
		} @pending {
			<p data-g="pending">Loading</p>
		}
	</main>
}
