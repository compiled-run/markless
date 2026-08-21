import { state } from '@markless/core';
import { checkbox } from '../../index.ts';

// The accept-the-terms form every signup has. It writes what the browser
// actually put in the FormData, so the assertions read a submission rather than
// an attribute.
export default function TermsForm() @{
	let submitted = state('');

	<form
		data-testid="form"
		onSubmit={(event) => {
			event.preventDefault();
			submitted = JSON.stringify(Object.fromEntries(new FormData(event.target as HTMLFormElement)));
		}}
	>
		<checkbox.root name="terms" data-testid="root">
			<checkbox.field data-testid="field" />
			<checkbox.trigger data-testid="trigger"><checkbox.indicator data-testid="indicator">Checked</checkbox.indicator></checkbox.trigger>
			<checkbox.label data-testid="label">I accept the Terms and Conditions</checkbox.label>
		</checkbox.root>
		<button type="submit" data-testid="submit">Submit</button>
		<output data-testid="submitted">{submitted}</output>
	</form>
}
