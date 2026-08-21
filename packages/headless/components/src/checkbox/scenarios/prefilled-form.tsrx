import { state } from '@markless/core';
import { checkbox } from '../../index.ts';

// The same form reopened on a saved record: already accepted, still required,
// and submitting its own value rather than the browser default "on". A real
// prefilled form carries checked, required and value together.
export default function PrefilledForm() @{
	let submitted = state('');

	<form
		data-testid="form"
		onSubmit={(event) => {
			event.preventDefault();
			submitted = JSON.stringify(Object.fromEntries(new FormData(event.target as HTMLFormElement)));
		}}
	>
		<checkbox.root name="terms" value="checked" checked required data-testid="root">
			<checkbox.field data-testid="field" />
			<checkbox.trigger data-testid="trigger"><checkbox.indicator data-testid="indicator">Checked</checkbox.indicator></checkbox.trigger>
			<checkbox.label data-testid="label">I accept the Terms and Conditions</checkbox.label>
		</checkbox.root>
		<button type="submit" data-testid="submit">Submit</button>
		<output data-testid="submitted">{submitted}</output>
	</form>
}
