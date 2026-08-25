import { dateinput } from '../../index.ts';

// The same family with the boxes written day, month, year. Reading order is the
// order the parts are written in - there is no format prop, and left and right
// walk the boxes in that order.
export default function DayMonthYear() @{
	<dateinput.root value="2024-03-30" name="starts" data-testid="root">
		<dateinput.label data-testid="label">Start date</dateinput.label>
		<dateinput.dayinput data-testid="dayinput" />
		<dateinput.monthinput data-testid="monthinput" />
		<dateinput.yearinput data-testid="yearinput" />
	</dateinput.root>
}
