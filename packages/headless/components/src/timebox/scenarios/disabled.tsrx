import { timebox } from '../../index.ts';

// A time nobody may change: every box drops out of the tab order and no key moves
// it.
export default function Disabled() @{
	<timebox.root locale="en-US" value="14:30" disabled name="starts" data-testid="root">
		<timebox.label data-testid="label">Start time</timebox.label>
		<timebox.hourinput data-testid="hourinput" />
		<timebox.minuteinput data-testid="minuteinput" />
		<timebox.dayperiodinput data-testid="dayperiodinput" />
		<timebox.field data-testid="field" />
	</timebox.root>
}
