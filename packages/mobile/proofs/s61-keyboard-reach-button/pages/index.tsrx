import { state } from '@markless/core';

export default function NewNote() @{
	let title = state('');
	let saved = state(false);
	<main class="page">
		<style>
			.page {
				padding: 24px;
				background: #fbf8f1;
				color: #1f1d1a;
			}
			.heading {
				margin: 0 0 12px;
				font-size: 26px;
				font-weight: 700;
			}
			.field {
				display: grid;
				gap: 6px;
				margin-bottom: 14px;
				font-weight: 600;
			}
			.field input,
			.field textarea {
				display: block;
				width: 100%;
				padding: 12px 14px;
				border: 1px solid #e4ddcf;
				border-radius: 10px;
				background: #ffffff;
				font: inherit;
				font-weight: 400;
			}
			.field textarea {
				height: 220px;
			}
			.save {
				display: block;
				width: 100%;
				padding: 12px 16px;
				border: 0;
				border-radius: 12px;
				background: #c2410c;
				color: #ffffff;
				font: inherit;
				font-weight: 600;
			}
		</style>
		<h1 class="heading">New note</h1>
		<label class="field">
			Title
			<input autocomplete="off" value={title} onInput={(event) => (title = event.currentTarget.value)} />
		</label>
		<label class="field">
			Note
			<textarea rows="6"></textarea>
		</label>
		@if (saved) {
			<p>Saved</p>
		} @else {
			<p>Not saved yet</p>
		}
		<button class="save" onClick={() => (saved = true)}>
			Save note
		</button>
	</main>
}
