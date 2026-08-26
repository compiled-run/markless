import { datebox } from '../../index.ts';

// A date nobody may change: every box is out of the tab order and refuses keys.
export default function Disabled() @{
	<datebox.root value="2024-03-30" disabled name="starts" data-testid="root">
		<datebox.label data-testid="label">Start date</datebox.label>
		<datebox.monthinput data-testid="monthinput" />
		<datebox.dayinput data-testid="dayinput" />
		<datebox.yearinput data-testid="yearinput" />
		<datebox.field data-testid="field" />
	</datebox.root>
}
