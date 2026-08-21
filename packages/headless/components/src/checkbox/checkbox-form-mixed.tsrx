import { state } from '@markless/core';
import { checkbox } from '../index.ts';

// Indeterminate is not checked: a mixed box submits nothing, and resolves to
// checked on the first click the way a native indeterminate box does. Written
// out rather than wrapping the basic form example, because `checked="mixed"`
// is seeded on the root here rather than arriving through a prop hop.
export default function MixedFormCheckbox() @{
	let submitted = state('');

	<form
		data-testid="form"
		onSubmit={(event) => {
			event.preventDefault();
			submitted = JSON.stringify(Object.fromEntries(new FormData(event.target)));
		}}
	>
		<checkbox.root name="terms" checked="mixed" data-testid="root">
			<checkbox.field data-testid="field" />
			<checkbox.trigger data-testid="trigger"><checkbox.indicator data-testid="indicator">Checked</checkbox.indicator></checkbox.trigger>
		</checkbox.root>
		<button type="submit" data-testid="submit">Submit</button>
		<output data-testid="submitted">{submitted}</output>
	</form>
}
