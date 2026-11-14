import { computed, storage } from '@markless/core';
import { listBooks } from './shelf.ts';

// A stored choice beside a streamed answer, kept by the browser across reloads and tabs.
function Stored() @{
	let mode = storage('first-interaction-mode', 'light');
	const books = computed(async () => listBooks('all', 0));

	<section class="stored">
		<button class="mode" onClick={() => (mode = mode === 'light' ? 'dark' : 'light')}>Mode {mode}</button>
		@try {
			<p class="count">{books.length} books</p>
		} @pending {
			<p class="loading">Loading</p>
		}
	</section>
}

export function StoredPage() @{
	<div class="stored-page">
		<Stored />
	</div>
}
