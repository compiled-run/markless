import { state } from '@markless/core';
import { dateinput } from '../../index.ts';

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
		<dateinput.root value="2024-03-30" required name="arrival" data-testid="root">
			<dateinput.label data-testid="label">Arrival</dateinput.label>
			<dateinput.monthinput data-testid="monthinput" />
			<dateinput.dayinput data-testid="dayinput" />
			<dateinput.yearinput data-testid="yearinput" />
			<dateinput.field data-testid="field" />
		</dateinput.root>
		<button type="submit" data-testid="submit">Submit</button>
		<output data-testid="submitted">{submitted}</output>
	</form>
}
