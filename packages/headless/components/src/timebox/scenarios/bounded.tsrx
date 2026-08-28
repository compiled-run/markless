import { timebox } from '../../index.ts';

// A time held between two bounds. The bounds hold the whole time rather than any
// one box, so a step past one can pull several boxes back at once.
export default function Bounded() @{
	<timebox.root
		locale="de-DE"
		value="09:30"
		min="09:00"
		max="17:00"
		name="starts"
		data-testid="root"
	>
		<timebox.label data-testid="label">Startzeit</timebox.label>
		<timebox.hourinput data-testid="hourinput" />
		<timebox.minuteinput data-testid="minuteinput" />
		<timebox.field data-testid="field" />
	</timebox.root>
}
