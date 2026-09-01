import { state } from '@markless/core';
import { toggle } from '../../index.ts';

// A switch nobody may flip, beside one a person owns. A disabled control is left
// out of the form data set, so only the second name reaches the server.
export default function DisabledForm() @{
	let submitted = state('');

	<form
		data-testid="form"
		onSubmit={(event) => {
			event.preventDefault();
			submitted = JSON.stringify(Object.fromEntries(new FormData(event.target as HTMLFormElement)));
		}}
	>
		<toggle.root name="plan" value="pro" checked disabled data-testid="off-root">
			<toggle.label data-testid="off-label">Always on for your plan</toggle.label>
			<toggle.field data-testid="off-field" />
			<toggle.trigger data-testid="off-trigger"><toggle.thumb data-testid="off-thumb" /></toggle.trigger>
		</toggle.root>
		<toggle.root name="notifications" value="enabled" checked data-testid="on-root">
			<toggle.label data-testid="on-label">Notifications</toggle.label>
			<toggle.field data-testid="on-field" />
			<toggle.trigger data-testid="on-trigger"><toggle.thumb data-testid="on-thumb" /></toggle.trigger>
		</toggle.root>
		<button type="submit" data-testid="submit">Save</button>
		<output data-testid="submitted">{submitted}</output>
	</form>
}
