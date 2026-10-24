import { state } from '@markless/core';

export default function ArmForm() @{
	let open = state(true);
	let sent = state('none');

	<section>
		<button type="button" data-toggle onClick={() => (open = !open)}>Toggle</button>
		@if (open) {
			<form data-arm onSubmit={(event) => { event.preventDefault(); sent = 'arm'; }}>
				<button type="submit">Send</button>
			</form>
		}
		<output data-sent>{sent}</output>
	</section>
}
