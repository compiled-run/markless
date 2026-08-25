import { dateinput } from '../../index.ts';

// Day and month drawn as two digits, so a single-digit month reads `04` rather
// than `4`. The year is never padded.
export default function LeadingZero() @{
	<dateinput.root value="2024-04-05" name="starts" data-testid="root">
		<dateinput.label data-testid="label">Start date</dateinput.label>
		<dateinput.monthinput showLeadingZero data-testid="monthinput" />
		<dateinput.dayinput showLeadingZero data-testid="dayinput" />
		<dateinput.yearinput data-testid="yearinput" />
	</dateinput.root>
}
