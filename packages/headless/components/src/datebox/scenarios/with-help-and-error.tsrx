import { datebox } from '../../index.ts';

// A format hint and a validation message at once. The hint is written first and
// the boxes still name the error first, so the order comes from the family
// rather than from where the parts sit in the page.
export default function WithHelpAndError() @{
	<datebox.root name="starts" data-testid="root">
		<datebox.label data-testid="label">Start date</datebox.label>
		<datebox.monthinput data-testid="monthinput" />
		<datebox.dayinput data-testid="dayinput" />
		<datebox.yearinput data-testid="yearinput" />
		<datebox.description data-testid="description">
			(Month, day, then year)
		</datebox.description>
		<datebox.error data-testid="error">Enter a whole date</datebox.error>
	</datebox.root>
}
