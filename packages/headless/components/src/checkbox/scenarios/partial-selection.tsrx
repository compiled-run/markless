import { state } from '@markless/core';
import { checkbox } from '../../index.ts';

// A "select all" box over a partly-selected list: the third state, in a form.
// Indeterminate is not checked, so it submits nothing, and it resolves to
// checked on the first click the way a native indeterminate box does.
export default function PartialSelection() @{
	let submitted = state('');

	<form
		data-testid="form"
		onSubmit={(event) => {
			event.preventDefault();
			submitted = JSON.stringify(Object.fromEntries(new FormData(event.target as HTMLFormElement)));
		}}
	>
		<checkbox.root name="terms" checked="mixed" data-testid="root">
			<checkbox.field data-testid="field" />
			<checkbox.trigger data-testid="trigger"><checkbox.indicator data-testid="indicator">Checked</checkbox.indicator></checkbox.trigger>
			<checkbox.label data-testid="label">Select all</checkbox.label>
		</checkbox.root>
		<button type="submit" data-testid="submit">Submit</button>
		<output data-testid="submitted">{submitted}</output>
	</form>
}
