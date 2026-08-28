import { datebox } from '../../index.ts';

// A booking window. The date is inside it; stepping past either end pulls the
// whole date back to the bound, which can move all three boxes at once.
export default function Bounded() @{
	<datebox.root
		value="2024-03-15"
		min="2024-03-10"
		max="2024-03-20"
		name="stay"
		data-testid="root"
	>
		<datebox.label data-testid="label">Arrival</datebox.label>
		<datebox.monthinput data-testid="monthinput" />
		<datebox.dayinput data-testid="dayinput" />
		<datebox.yearinput data-testid="yearinput" />
		<datebox.field data-testid="field" />
	</datebox.root>
}
