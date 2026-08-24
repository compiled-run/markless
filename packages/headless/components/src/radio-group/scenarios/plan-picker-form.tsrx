import { state } from '@markless/core';
import { radiogroup } from '../../index.ts';

// The plan picker a checkout has: a real form, a required choice, and an output
// that writes what the browser itself put in the FormData.
export function PlanPickerForm() @{
	let submitted = state('');

	<form
		data-testid="form"
		onSubmit={(event) => {
			event.preventDefault();
			submitted = JSON.stringify(Object.fromEntries(new FormData(event.target as HTMLFormElement)));
		}}
	>
		<radiogroup.root data-testid="root" name="plan" required>
			<radiogroup.label data-testid="label">Billing Period</radiogroup.label>
			<radiogroup.item value="monthly" data-testid="monthly">
				<radiogroup.itemfield data-testid="monthly-field" />
				<radiogroup.itemtrigger data-testid="monthly-trigger">
					<radiogroup.itemindicator data-testid="monthly-indicator">Chosen</radiogroup.itemindicator>
				</radiogroup.itemtrigger>
				<radiogroup.itemlabel data-testid="monthly-label">Monthly</radiogroup.itemlabel>
			</radiogroup.item>
			<radiogroup.item value="annual" data-testid="annual">
				<radiogroup.itemfield data-testid="annual-field" />
				<radiogroup.itemtrigger data-testid="annual-trigger">
					<radiogroup.itemindicator data-testid="annual-indicator">Chosen</radiogroup.itemindicator>
				</radiogroup.itemtrigger>
				<radiogroup.itemlabel data-testid="annual-label">Annual</radiogroup.itemlabel>
			</radiogroup.item>
		</radiogroup.root>
		<button type="submit" data-testid="submit">Subscribe</button>
		<output data-testid="submitted">{submitted}</output>
	</form>
}
