import { computed, state } from '@markless/core';
import { loadTodos } from './api.ts';

export default function Still() @{
	let note = state('n');
	<main>
		<p>{note}</p>
		<Shelf topic="du" />
	</main>
}

function Shelf({ topic }: { topic: string }) @{
	let seen = state(topic);
	const books = computed(async () => loadTodos(seen, 0));
	<article class="shelf">
		@try {
			<ol>
				@for (const book of books; key book.id) {
					<li><b>{book.name}</b></li>
				}
			</ol>
		} @pending {
			<em>wait</em>
		} @catch {
			<em>broken</em>
		}
	</article>
}
