import { timebox } from '../../index.ts';

// A time already known: the boxes read it out of the one `value`, which is always
// 24-hour however the locale shows it. 14:30 on a 12-hour clock is 2:30 PM.
export default function Prefilled() @{
	<timebox.root locale="en-US" value="14:30" name="starts" data-testid="root">
		<timebox.label data-testid="label">Start time</timebox.label>
		<timebox.hourinput data-testid="hourinput" />
		<timebox.minuteinput data-testid="minuteinput" />
		<timebox.dayperiodinput data-testid="dayperiodinput" />
		<timebox.field data-testid="field" />
	</timebox.root>
}
