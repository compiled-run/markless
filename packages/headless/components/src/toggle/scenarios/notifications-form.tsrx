import { state } from '@markless/core';
import { toggle } from '../../index.ts';

// A settings form with a switch in it. On submit it renders the FormData the browser
// actually built, so a test can read a submission rather than an attribute.
export default function NotificationsForm() @{
	let submitted = state('');

	<form
		data-testid="form"
		onSubmit={(event) => {
			event.preventDefault();
			submitted = JSON.stringify(Object.fromEntries(new FormData(event.target as HTMLFormElement)));
		}}
	>
		<toggle.root name="notifications" data-testid="root">
			<toggle.field data-testid="field" />
			<toggle.label data-testid="label">Enable notifications</toggle.label>
			<toggle.trigger data-testid="trigger"><toggle.thumb data-testid="thumb" /></toggle.trigger>
		</toggle.root>
		<button type="submit" data-testid="submit">Submit</button>
		<output data-testid="submitted">{submitted}</output>
	</form>
}
