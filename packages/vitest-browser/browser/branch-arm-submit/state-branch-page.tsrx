import { state } from '@markless/core';

export default function StateBranchPage() @{
	let open = state(true);
	<main>
		@if (open) {
			<form data-form onSubmit={(event) => event.preventDefault()}>
				<button type="submit">Send</button>
			</form>
		} @else {
			<p>closed</p>
		}
	</main>
}
