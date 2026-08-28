import { timebox } from '../../index.ts';

// Both messages at once. Mounting the error part is what marks the boxes
// invalid, and every box names both messages - the error first, so what is wrong
// is conveyed before the format hint.
export default function WithHelpAndError() @{
	<timebox.root locale="en-US" name="starts" data-testid="root">
		<timebox.label data-testid="label">Start time</timebox.label>
		<timebox.hourinput data-testid="hourinput" />
		<timebox.minuteinput data-testid="minuteinput" />
		<timebox.dayperiodinput data-testid="dayperiodinput" />
		{/* The hint is written above the error on purpose: the boxes still name the
		    error first, so the order is the family's rather than the document's. */}
		<timebox.description data-testid="description">(Hour, minute, then AM or PM)</timebox.description>
		<timebox.error data-testid="error">Enter a whole time</timebox.error>
	</timebox.root>
}
