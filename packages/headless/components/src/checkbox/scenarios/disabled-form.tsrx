import { state } from '@markless/core';
import { checkbox } from '../../index.ts';

// A checked box nobody may untick, beside one a person owns. A disabled control is
// left out of the form data set, so only the second name reaches the server.
export default function DisabledForm() @{
	let submitted = state('');

	<form
		data-testid="form"
		onSubmit={(event) => {
			event.preventDefault();
			submitted = JSON.stringify(Object.fromEntries(new FormData(event.target as HTMLFormElement)));
		}}
	>
		<checkbox.root name="plan" value="pro" checked disabled data-testid="off-root">
			<checkbox.field data-testid="off-field" />
			<checkbox.trigger data-testid="off-trigger">
				<checkbox.indicator data-testid="off-indicator">Checked</checkbox.indicator>
			</checkbox.trigger>
			<checkbox.label data-testid="off-label">Always on for your plan</checkbox.label>
		</checkbox.root>
		<checkbox.root name="news" value="on" checked data-testid="on-root">
			<checkbox.field data-testid="on-field" />
			<checkbox.trigger data-testid="on-trigger">
				<checkbox.indicator data-testid="on-indicator">Checked</checkbox.indicator>
			</checkbox.trigger>
			<checkbox.label data-testid="on-label">Product news</checkbox.label>
		</checkbox.root>
		<button type="submit" data-testid="submit">Submit</button>
		<output data-testid="submitted">{submitted}</output>
	</form>
}
