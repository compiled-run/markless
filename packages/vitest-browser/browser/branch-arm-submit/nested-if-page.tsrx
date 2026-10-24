import { state } from '@markless/core';

function Panel({ open }: { open: boolean }) @{
	let note = state(true);
	let sent = state(0);
	@if (open) {
		<section>
			@if (note) {
				<>
					<p data-note>note one</p>
					<p>note two</p>
				</>
			}
			<form data-form onSubmit={(event) => { event.preventDefault(); sent = sent + 1; }}>
				<button type="submit">Send</button>
			</form>
			<p data-sent>{sent}</p>
			<button data-toggle onClick={() => note = !note}>toggle</button>
		</section>
	} @else {
		<p>closed</p>
	}
}

export default function NestedIfPage() @{
	<main>
		<Panel open={true} />
	</main>
}
