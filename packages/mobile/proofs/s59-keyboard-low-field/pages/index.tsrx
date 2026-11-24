import { state } from '@markless/core';

export default function Note() @{
	let title = state('');
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
			.filler {
				height: 330px;
				margin-bottom: 16px;
				border: 1px solid #e4ddcf;
				border-radius: 12px;
				background: #ffffff;
			}
			.field {
				display: grid;
				gap: 6px;
				font-weight: 600;
			}
			.field {
				margin-bottom: 12px;
			}
			.field input,
			.field textarea {
				width: 100%;
				padding: 12px 14px;
				border: 1px solid #e4ddcf;
				border-radius: 10px;
				background: #ffffff;
				font: inherit;
				font-weight: 400;
			}
		</style>
		<h1 class="heading">New note</h1>
		<div class="filler"></div>
		<label class="field">
			Body
			<textarea rows="2"></textarea>
		</label>
		@if (title === '') {
			<p>Nothing typed</p>
		} @else {
			<p>Typed</p>
		}
		<label class="field">
			Title
			<input autocomplete="off" value={title} onInput={(event) => (title = event.currentTarget.value)} />
		</label>
	</main>
}
