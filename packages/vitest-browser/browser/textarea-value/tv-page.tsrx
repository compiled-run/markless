import { state } from '@markless/core';

export default function TextareaValuePage() @{
	let body = state('Hello <b> & </textarea>');
	let open = state(true);
	const notes = state([
		{ id: 1, text: 'first note' },
		{ id: 2, text: 'second note' },
	]);

	<section>
		<textarea data-body value={body} onInput={(event) => (body = (event.target as HTMLTextAreaElement).value)}></textarea>
		<textarea data-static value="fixed text"></textarea>
		<input data-mirror value={body} />
		<output data-echo>{body}</output>
		<button data-reset type="button" onClick={() => (body = 'reset')}>reset</button>
		<button data-toggle type="button" onClick={() => (open = !open)}>toggle</button>
		@if (open) {
			<textarea data-arm value={body}></textarea>
		}
		@for (const note of notes; key note.id) {
			<textarea data-note value={note.text}></textarea>
		}
	</section>
}
