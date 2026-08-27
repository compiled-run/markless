import { datebox } from '../../index.ts';

// The same family with the boxes written day, month, year. Reading order is the
// order the parts are written in - there is no format prop, and left and right
// walk the boxes in that order.
export default function DayMonthYear() @{
	<datebox.root value="2024-03-30" name="starts" data-testid="root">
		<datebox.label data-testid="label">Start date</datebox.label>
		<datebox.dayinput data-testid="dayinput" />
		<datebox.monthinput data-testid="monthinput" />
		<datebox.yearinput data-testid="yearinput" />
	</datebox.root>
}
