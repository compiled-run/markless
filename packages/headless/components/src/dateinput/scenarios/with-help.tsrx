import { dateinput } from '../../index.ts';

// A format hint under the boxes. Help text leaves them valid.
export default function WithHelp() @{
	<dateinput.root name="starts" data-testid="root">
		<dateinput.label data-testid="label">Start date</dateinput.label>
		<dateinput.monthinput data-testid="monthinput" />
		<dateinput.dayinput data-testid="dayinput" />
		<dateinput.yearinput data-testid="yearinput" />
		<dateinput.description data-testid="description">
			(Month, day, then year)
		</dateinput.description>
	</dateinput.root>
}
