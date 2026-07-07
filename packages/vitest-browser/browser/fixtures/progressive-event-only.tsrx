import { state } from '@markless/core';

export function App() @{
	let total = state(0);
	let submits = state(0);

	<section class="plain-submit">
		<button type="button" data-counter-only onClick={() => total++}>Count {total}</button>
		<form data-event-form onSubmit={(event) => { event.preventDefault(); submits++; }}>
			<button type="submit" data-submit-count>Send {submits}</button>
		</form>
	</section>
}
