import { timebox } from '../../index.ts';

// The starter a consumer copies: a labelled time on a 12-hour clock, with the
// element a form submits. The locale is written out so the boxes read the same
// way wherever the page is served.
export default function Basic() @{
	<timebox.root locale="en-US" name="starts" data-testid="root">
		<timebox.label data-testid="label">Start time</timebox.label>
		<timebox.hourinput data-testid="hourinput" />
		<timebox.minuteinput data-testid="minuteinput" />
		<timebox.dayperiodinput data-testid="dayperiodinput" />
		<timebox.field data-testid="field" />
	</timebox.root>
}
