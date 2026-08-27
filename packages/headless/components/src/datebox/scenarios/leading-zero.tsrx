import { datebox } from '../../index.ts';

// Day and month drawn as two digits, so a single-digit month reads `04` rather
// than `4`. The year is never padded.
export default function LeadingZero() @{
	<datebox.root value="2024-04-05" name="starts" data-testid="root">
		<datebox.label data-testid="label">Start date</datebox.label>
		<datebox.monthinput showLeadingZero data-testid="monthinput" />
		<datebox.dayinput showLeadingZero data-testid="dayinput" />
		<datebox.yearinput data-testid="yearinput" />
	</datebox.root>
}
