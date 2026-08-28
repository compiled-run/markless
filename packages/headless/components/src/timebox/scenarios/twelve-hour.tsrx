import { timebox } from '../../index.ts';

// A 12-hour clock asked for outright rather than inherited from the locale: a
// German page that wants an AM/PM box anyway. The words in that box are whatever
// the locale's own data says - German's happen to be "AM" and "PM" - rather than
// a string this family hardcodes.
export default function TwelveHour() @{
	<timebox.root locale="de-DE" hour12 value="14:30" name="starts" data-testid="root">
		<timebox.label data-testid="label">Startzeit</timebox.label>
		<timebox.hourinput data-testid="hourinput" />
		<timebox.minuteinput data-testid="minuteinput" />
		<timebox.dayperiodinput data-testid="dayperiodinput" />
		<timebox.field data-testid="field" />
	</timebox.root>
}
