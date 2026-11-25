import { state } from '@markless/core';

export default function NotesBody() @{
	let body = state('');
	<main class="page">
		<style>
			.page {
				padding: 24px;
				background: #fbf8f1;
				color: #1f1d1a;
			}
			.body {
				display: block;
				width: 100%;
				margin-bottom: 18px;
				padding: 12px 14px;
				border: 1px solid #e4ddcf;
				border-radius: 10px;
				background: #ffffff;
				line-height: 1.45;
			}
			/* The notes form's /new field: a phone draws no resize grip, and the textarea keeps its default scrollbar width. */
			.body.notes {
				min-height: 180px;
				resize: vertical;
			}
		</style>
		<title>Note body</title>
		<textarea class="body notes" aria-label="Body" rows="8" placeholder="Write the note" value={body} onInput={(event) => (body = event.currentTarget.value)}></textarea>
		@if (body === '') {
			<p>Nothing written</p>
		} @else {
			<p>Written</p>
		}
		<textarea class="body" aria-label="Saved body" rows="3" readonly>Milk and eggs</textarea>
	</main>
}
