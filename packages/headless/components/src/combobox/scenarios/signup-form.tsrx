import { state } from '@markless/core';
import * as combobox from '../index.ts';

// A real form, a required choice, a description and an error, and an output
// that writes what the browser itself put in the FormData.
export function SignupForm() @{
	let submitted = state('');

	<form
		data-testid="form"
		onSubmit={(event) => {
			event.preventDefault();
			submitted = JSON.stringify(Object.fromEntries(new FormData(event.target as HTMLFormElement)));
		}}
	>
		<combobox.root open name="plan" required data-testid="root">
			<combobox.label data-testid="label">Billing Plan</combobox.label>
			<combobox.input data-testid="input" />
			<combobox.description data-testid="description">Pick how you pay.</combobox.description>
			<combobox.trigger data-testid="trigger">Show</combobox.trigger>
			<combobox.field data-testid="field" />
			<combobox.content data-testid="content">
				<combobox.item value="monthly" label="Monthly" data-testid="monthly">
					<combobox.itemlabel data-testid="monthly-itemlabel">Monthly</combobox.itemlabel>
				</combobox.item>
				<combobox.item value="annual" label="Annual" data-testid="annual">
					<combobox.itemlabel data-testid="annual-itemlabel">Annual</combobox.itemlabel>
				</combobox.item>
			</combobox.content>
		</combobox.root>
		<button type="submit" data-testid="submit">Subscribe</button>
		<output data-testid="submitted">{submitted}</output>
	</form>
}
