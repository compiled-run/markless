import { timebox } from '../../index.ts';

// A time that can be read and walked but not changed: the boxes stay focusable,
// so a reader can still review them, and every key that would edit does nothing.
export default function ReadOnly() @{
	<timebox.root locale="en-US" value="14:30" readonly name="starts" data-testid="root">
		<timebox.label data-testid="label">Start time</timebox.label>
		<timebox.hourinput data-testid="hourinput" />
		<timebox.minuteinput data-testid="minuteinput" />
		<timebox.dayperiodinput data-testid="dayperiodinput" />
		<timebox.field data-testid="field" />
	</timebox.root>
}
