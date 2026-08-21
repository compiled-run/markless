import { state } from '@markless/core';
import { toggle } from '../../index.ts';

// The same form reopened on saved settings: already on, still required, and
// submitting its own value rather than the browser default "on".
export default function SavedSettingsForm() @{
	let submitted = state('');

	<form
		data-testid="form"
		onSubmit={(event) => {
			event.preventDefault();
			submitted = JSON.stringify(Object.fromEntries(new FormData(event.target)));
		}}
	>
		<toggle.root name="notifications" value="enabled" checked required data-testid="root">
			<toggle.field data-testid="field" />
			<toggle.label data-testid="label">Enable notifications</toggle.label>
			<toggle.trigger data-testid="trigger"><toggle.thumb data-testid="thumb" /></toggle.trigger>
		</toggle.root>
		<button type="submit" data-testid="submit">Submit</button>
		<output data-testid="submitted">{submitted}</output>
	</form>
}
