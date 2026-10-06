import { computed, state } from '@markless/core';

export default function NotePanel() @{
	let open = state(false);
	let note = state('');
	const long = computed(() => note.length > 20);

	<section>
		<button onClick={() => (open = !open)}>Show or hide the note</button>
		@if (open) {
			<label>
				Note
				<input value={note} onInput={(event) => (note = event.currentTarget.value)} />
			</label>
		}
		@if (long) {
			<p>That is a long note.</p>
		} @else {
			<p>Short and sweet.</p>
		}
	</section>
}
