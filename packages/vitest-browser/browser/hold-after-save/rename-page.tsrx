import { computed, state } from '@markless/core';
import { loadShelf, rename } from './server.ts';

export default function RenamePage() @{
	const shelf = computed(async () => await loadShelf());
	let editing = state(false);
	let pendingTitle = state<string | null>(null);

	<main>
		@try {
			<section>
				<h2 data-title>{pendingTitle ?? shelf.name}</h2>
				<span data-server>{shelf.name}</span>
				<button data-edit onClick={() => (editing = true)}>Rename</button>
				@if (editing) {
					<button
						data-rename
						onClick={async () => {
							pendingTitle = 'Pantry';
							try {
								await rename('Pantry');
								editing = false;
							} finally {
								pendingTitle = null;
							}
						}}
					>
						Save name
					</button>
				}
			
			</section>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
