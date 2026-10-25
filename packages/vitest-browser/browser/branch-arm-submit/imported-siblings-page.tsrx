import { state } from '@markless/core';
import ImportedCard from './imported-card.tsrx';

export default function ImportedSiblingsPage() @{
	let open = state(true);
	let sent = state(0);
	<main>
		@if (open) {
			<section>
				<ImportedCard label="before" />
				<form data-form onSubmit={(event) => { event.preventDefault(); sent = sent + 1; }}>
					<button type="submit">Send</button>
				</form>
				<p data-sent>{sent}</p>
				<ImportedCard label="after" />
			</section>
		} @else {
			<p>closed</p>
		}
	</main>
}
