import { state } from '@markless/core';
import { select } from '../../index.ts';

// The plan picker a signup has: a real form, a required choice, and an output
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
		<select.root name="plan" required data-testid="root">
			<select.label data-testid="label">Billing Plan</select.label>
			<select.trigger data-testid="trigger">Choose a plan</select.trigger>
			<select.field data-testid="field" />
			<select.content data-testid="content">
				<select.item value="monthly" data-testid="monthly">
					<select.itemlabel data-testid="monthly-itemlabel">Monthly</select.itemlabel>
					<select.itemindicator data-testid="monthly-itemindicator">Chosen</select.itemindicator>
				</select.item>
				<select.item value="annual" data-testid="annual">
					<select.itemlabel data-testid="annual-itemlabel">Annual</select.itemlabel>
					<select.itemindicator data-testid="annual-itemindicator">Chosen</select.itemindicator>
				</select.item>
			</select.content>
		</select.root>
		<button type="submit" data-testid="submit">Subscribe</button>
		<output data-testid="submitted">{submitted}</output>
	</form>
}
