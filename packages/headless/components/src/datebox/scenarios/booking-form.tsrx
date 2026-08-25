import { state } from '@markless/core';
import { datebox } from '../../index.ts';

// A booking form with a date in it. On submit it renders the FormData the browser
// actually built, so a test can read a submission rather than an attribute.
export default function BookingForm() @{
	let submitted = state('');

	<form
		data-testid="form"
		onSubmit={(event) => {
			event.preventDefault();
			submitted = JSON.stringify(Object.fromEntries(new FormData(event.target as HTMLFormElement)));
		}}
	>
		<datebox.root value="2024-03-30" required name="arrival" data-testid="root">
			<datebox.label data-testid="label">Arrival</datebox.label>
			<datebox.monthinput data-testid="monthinput" />
			<datebox.dayinput data-testid="dayinput" />
			<datebox.yearinput data-testid="yearinput" />
			<datebox.field data-testid="field" />
		</datebox.root>
		<button type="submit" data-testid="submit">Submit</button>
		<output data-testid="submitted">{submitted}</output>
	</form>
}
