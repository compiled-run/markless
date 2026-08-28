import { timebox } from '../../index.ts';

// A locale that writes a 24-hour clock. No AM/PM box is written, because a
// 24-hour time already says which half of the day it means.
export default function TwentyFourHour() @{
	<timebox.root locale="de-DE" name="starts" data-testid="root">
		<timebox.label data-testid="label">Startzeit</timebox.label>
		<timebox.hourinput data-testid="hourinput" />
		<timebox.minuteinput data-testid="minuteinput" />
		<timebox.field data-testid="field" />
	</timebox.root>
}
