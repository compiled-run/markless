import { computed, state } from '@markless/core';
import { loadTodos } from './api.ts';

export default function Pair() @{
	let poll = state(1);
	<main>
		<button data-poll onClick={() => poll++}>Poll</button>
		<Shelf topic="du" poll={poll} />
		<Shelf topic="m" poll={poll} />
	</main>
}

function Shelf({ topic, poll }: { topic: string; poll: number }) @{
	const books = computed(async () => loadTodos(topic, poll));
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
