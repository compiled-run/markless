import { state } from '@markless/core';
import { editable } from '../../index.ts';

// A disabled editable inside a real form. A disabled control is barred from
// submission by the platform, so the hidden input the field part renders has to
// carry the flag too.
export default function DisabledForm() @{
	let submitted = state('unsubmitted');

	<form
		data-testid="form"
		onSubmit={(event) => {
			event.preventDefault();
			submitted = String(new FormData(event.target as HTMLFormElement).get('title') ?? 'absent');
		}}
	>
		<editable.root disabled name="title" data-testid="root" defaultValue="Untitled">
			<editable.label data-testid="label">Report name</editable.label>
			<editable.trigger data-testid="trigger" />
			<editable.input data-testid="input" />
			<editable.field data-testid="field" />
		</editable.root>
		<button type="submit" data-testid="submit">Save</button>
		<output data-testid="submitted">{submitted}</output>
	</form>
}
