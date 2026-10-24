import { state } from '@markless/core';

export default function TextBeforePage() @{
	let open = state(true);
	let count = state(2);
	let sent = state(0);
	<main>
		@if (open) {
			<section>
				Total {count} items
				<form data-form onSubmit={(event) => { event.preventDefault(); sent = sent + 1; }}>
					<button type="submit">Send</button>
				</form>
				<p data-sent>{sent}</p>
				<button data-bump onClick={() => count = count + 1}>bump</button>
			</section>
		} @else {
			<p>closed</p>
		}
	</main>
}
