import { dateinput } from '../../index.ts';

// A date already known: the three boxes read it out of the one `value`.
export default function Prefilled() @{
	<dateinput.root value="2024-03-30" name="starts" data-testid="root">
		<dateinput.label data-testid="label">Start date</dateinput.label>
		<dateinput.monthinput data-testid="monthinput" />
		<dateinput.dayinput data-testid="dayinput" />
		<dateinput.yearinput data-testid="yearinput" />
		<dateinput.field data-testid="field" />
	</dateinput.root>
}
