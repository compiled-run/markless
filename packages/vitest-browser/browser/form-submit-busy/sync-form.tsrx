import { state } from '@markless/core';

export function SyncForm() @{
	let sent = state(0);

	<form
		data-form
		onSubmit={(event) => {
			event.preventDefault();
			sent++;
		}}
	>
		<button type="submit" data-submit>Send</button>
		<output data-sent>{sent}</output>
	</form>
}
