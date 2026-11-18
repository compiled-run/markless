import { computed, state } from '@markless/core';

async function loadNotes(count: number): Promise<Array<{ id: string; text: string }>> {
	await new Promise((resolve) => setTimeout(resolve, 20));
	return ['a', 'b', 'c'].slice(0, count).map((id) => ({ id, text: `note ${id}` }));
}

export default function DirectLength() @{
	let count = state(0);
	const notes = computed(async () => await loadNotes(count));
	const latest = computed(async () => (count === 0 ? null : (await loadNotes(count))[0]!));
	const any = computed(() => notes.length > 0);

	<article>
		<button type="button" data-more onClick={() => count++}>More</button>
		@try {
			@if (notes.length > 0) {
				<ul data-shown>@for (const note of notes; key note.id) { <li>{note.text}</li> }</ul>
			}
		} @pending {
			<p data-loading>Loading</p>
		}
	</article>
}
