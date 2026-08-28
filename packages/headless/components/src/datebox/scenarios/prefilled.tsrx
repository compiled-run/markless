import { datebox } from '../../index.ts';

// A date already known: the three boxes read it out of the one `value`.
export default function Prefilled() @{
	<datebox.root value="2024-03-30" name="starts" data-testid="root">
		<datebox.label data-testid="label">Start date</datebox.label>
		<datebox.monthinput data-testid="monthinput" />
		<datebox.dayinput data-testid="dayinput" />
		<datebox.yearinput data-testid="yearinput" />
		<datebox.field data-testid="field" />
	</datebox.root>
}
