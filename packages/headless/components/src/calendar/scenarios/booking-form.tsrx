import { state } from '@markless/core';
import { calendar } from '../../index.ts';

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
		<calendar.root month="2026-08-01" value="2026-08-14" required name="arrival" data-testid="root">
			<calendar.label data-testid="label">Arrival</calendar.label>
			<Month />
			<calendar.field data-testid="field" />
		</calendar.root>
		<button type="submit" data-testid="submit">Submit</button>
		<output data-testid="submitted">{submitted}</output>
	</form>
}

function Month() @{
	const cal = calendar.state();

	<calendar.content data-testid="content">
		<calendar.backtrigger data-testid="back">Back</calendar.backtrigger>
		<calendar.title data-testid="title" />
		<calendar.forwardtrigger data-testid="forward">Forward</calendar.forwardtrigger>
		<div data-testid="weekdays" aria-hidden="true">
			@for (const name of cal.weekdays; key name) {
				<span data-testid="weekday">{name}</span>
			}
		</div>
		<div data-testid="days">
			@for (const day of cal.days; key day) {
				<calendar.item value={day} data-testid="day" />
			}
		</div>
	</calendar.content>
}
