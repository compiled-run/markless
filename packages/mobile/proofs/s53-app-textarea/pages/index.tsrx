import { state } from '@markless/core';

export default function Body() @{
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
				background: #ffffff;
				line-height: 1.45;
				resize: none;
				scrollbar-width: none;
			}
		</style>
		<title>Note body</title>
		<textarea class="body" aria-label="Body" rows="4" placeholder="Write the note" value={body} onInput={(event) => (body = event.currentTarget.value)}></textarea>
		@if (body === '') {
			<p>Nothing written</p>
		} @else {
			<p>Written</p>
		}
		<textarea class="body" aria-label="Saved body" rows="3" readonly>Milk and eggs</textarea>
	</main>
}
