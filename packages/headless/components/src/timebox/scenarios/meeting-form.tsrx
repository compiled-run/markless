import { state } from '@markless/core';
import { timebox } from '../../index.ts';

// A form with a time in it. On submit it renders the FormData the browser
// actually built, so a test can read a submission rather than an attribute - and
// what it carries is the same `HH:mm` string a native time input would submit.
export default function MeetingForm() @{
	let submitted = state('');

	<form
		data-testid="form"
		onSubmit={(event) => {
			event.preventDefault();
			submitted = JSON.stringify(Object.fromEntries(new FormData(event.target as HTMLFormElement)));
		}}
	>
		<timebox.root locale="en-US" value="14:30" required name="meeting" data-testid="root">
			<timebox.label data-testid="label">Meeting time</timebox.label>
			<timebox.hourinput data-testid="hourinput" />
			<timebox.minuteinput data-testid="minuteinput" showLeadingZero />
			<timebox.dayperiodinput data-testid="dayperiodinput" />
			<timebox.field data-testid="field" />
		</timebox.root>
		<button type="submit" data-testid="submit">Submit</button>
		<output data-testid="submitted">{submitted}</output>
	</form>
}
