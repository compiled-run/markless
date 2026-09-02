import { state } from '@markless/core';
import { combobox } from '../../index.ts';

// A choice already made and the list closed, inside a form: what a person
// returning to a filled-in page presses Enter on.
export function PrefilledForm() @{
	let submitted = state('');

	<form
		data-testid="form"
		onSubmit={(event) => {
			event.preventDefault();
			submitted = JSON.stringify(Object.fromEntries(new FormData(event.target as HTMLFormElement)));
		}}
	>
		<combobox.root value="annual" name="plan" data-testid="root">
			<combobox.label data-testid="label">Billing Plan</combobox.label>
			<combobox.input data-testid="input" />
			<combobox.trigger data-testid="trigger">Show</combobox.trigger>
			<combobox.field data-testid="field" />
			<combobox.content data-testid="content">
				<combobox.item value="monthly" label="Monthly" data-testid="monthly">Monthly</combobox.item>
				<combobox.item value="annual" label="Annual" data-testid="annual">Annual</combobox.item>
			</combobox.content>
		</combobox.root>
		<button type="submit" data-testid="submit">Subscribe</button>
		<output data-testid="submitted">{submitted}</output>
	</form>
}
