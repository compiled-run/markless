import { datebox } from '../../index.ts';

// A format hint under the boxes. Help text leaves them valid.
export default function WithHelp() @{
	<datebox.root name="starts" data-testid="root">
		<datebox.label data-testid="label">Start date</datebox.label>
		<datebox.monthinput data-testid="monthinput" />
		<datebox.dayinput data-testid="dayinput" />
		<datebox.yearinput data-testid="yearinput" />
		<datebox.description data-testid="description">
			(Month, day, then year)
		</datebox.description>
	</datebox.root>
}
