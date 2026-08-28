import { timebox } from '../../index.ts';

// Writing a second box is what makes the reported time carry seconds: the parts
// on the page are the granularity, so there is no prop to keep in step.
export default function WithSeconds() @{
	<timebox.root locale="de-DE" value="09:05:07" name="starts" data-testid="root">
		<timebox.label data-testid="label">Lap time</timebox.label>
		<timebox.hourinput data-testid="hourinput" showLeadingZero />
		<timebox.minuteinput data-testid="minuteinput" showLeadingZero />
		<timebox.secondinput data-testid="secondinput" showLeadingZero />
		<timebox.field data-testid="field" />
	</timebox.root>
}
