import { timebox } from '../../index.ts';

// Two times on one page, on two different clocks. Each root is its own widget
// instance, so typing in one leaves the other where it was - and the two locales
// prove the clock is per-instance rather than per-module.
export default function TwoWidgets() @{
	<section>
		<timebox.root locale="en-US" value="14:30" name="from" data-testid="first-root">
			<timebox.label data-testid="first-label">From</timebox.label>
			<timebox.hourinput data-testid="first-hourinput" />
			<timebox.minuteinput data-testid="first-minuteinput" />
			<timebox.dayperiodinput data-testid="first-dayperiodinput" />
			<timebox.field data-testid="first-field" />
		</timebox.root>
		<timebox.root locale="de-DE" value="17:45" name="until" data-testid="second-root">
			<timebox.label data-testid="second-label">Until</timebox.label>
			<timebox.hourinput data-testid="second-hourinput" />
			<timebox.minuteinput data-testid="second-minuteinput" />
			<timebox.field data-testid="second-field" />
		</timebox.root>
	</section>
}
