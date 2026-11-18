import { computed, state } from '@markless/core';

type Note = { id: string; text: string };
const notesUpTo = (count: number): Array<Note> => ['a', 'b', 'c', 'd', 'e'].slice(0, count).map((id) => ({ id, text: `note ${id}` }));

async function findTitle(round: number) {
	await new Promise((resolve) => setTimeout(resolve, 20));
	return `round ${round}`;
}

export default function TryPlainIf() @{
	let round = state(0);
	let count = state(0);
	let open = state(true);
	let items = state<Array<Note>>([]);
	const title = computed(async () => await findTitle(round));

	<article>
		<button type="button" data-more onClick={() => { count++; items = notesUpTo(count); }}>More</button>
		<button type="button" data-toggle onClick={() => (open = !open)}>Toggle</button>
		<button type="button" data-refetch onClick={() => round++}>Refetch</button>
		@try {
			<section>
				<h2 data-title>{title}</h2>
				@if (open && items.length > 0) {
					<ul data-list>
						@for (const note of items; key note.id) {
							<li>{note.text}</li>
						}
					</ul>
				}
			</section>
		} @pending {
			<p data-loading>Loading</p>
		}
	</article>
}
