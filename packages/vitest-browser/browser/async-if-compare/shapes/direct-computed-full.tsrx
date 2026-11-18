import { computed, state } from '@markless/core';

async function loadNotes(count: number): Promise<Array<{ id: string; text: string }>> {
	await new Promise((resolve) => setTimeout(resolve, 20));
	return ['a', 'b', 'c'].slice(0, count).map((id) => ({ id, text: `note ${id}` }));
}

export default function DirectComputed() @{
	let count = state(1);
	const notes = computed(async () => await loadNotes(count));
	const latest = computed(async () => (count === 0 ? null : (await loadNotes(count))[0]!));
	const any = computed(() => notes.length > 0);

	<article>
		<button type="button" data-more onClick={() => count++}>More</button>
		@try {
			@if (any) {
				<p data-shown>{notes.length}</p>
			}
		} @pending {
			<p data-loading>Loading</p>
		}
	</article>
}
