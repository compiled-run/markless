import { state } from '@markless/core';
// Registration is a follow-up unit, so the barrel has no `editable` export yet.
import * as editable from '../index.ts';

// A real form. The editable is UNCONTROLLED here on purpose: the sibling taglist
// suite has a pinned red row where a controlled write inside a `<form>` ancestor
// never reaches the family's value cell, and an uncontrolled value keeps this
// scenario clear of that undiagnosed runtime question.
//
// A description and an error ride along, and the error is named ahead of the hint.
export default function RenameForm() @{
	let submitted = state('');

	<form
		data-testid="form"
		onSubmit={(event) => {
			event.preventDefault();
			submitted = String(new FormData(event.target as HTMLFormElement).get('title') ?? '');
		}}
	>
		<editable.root
			required
			invalid
			name="title"
			data-testid="root"
			defaultValue="Untitled"
		>
			<editable.label data-testid="label">Report name</editable.label>
			<editable.error data-testid="error">A report needs a name.</editable.error>
			<editable.description data-testid="description">Press Enter to save.</editable.description>
			<editable.trigger data-testid="trigger" />
			<editable.input data-testid="input" />
			<editable.field data-testid="field" />
		</editable.root>
		<button type="submit" data-testid="submit">Save</button>
		<output data-testid="submitted">{submitted}</output>
	</form>
}
