import { dateinput } from '../../index.ts';

// A date nobody may change: every box is out of the tab order and refuses keys.
export default function Disabled() @{
	<dateinput.root value="2024-03-30" disabled name="starts" data-testid="root">
		<dateinput.label data-testid="label">Start date</dateinput.label>
		<dateinput.monthinput data-testid="monthinput" />
		<dateinput.dayinput data-testid="dayinput" />
		<dateinput.yearinput data-testid="yearinput" />
		<dateinput.field data-testid="field" />
	</dateinput.root>
}
