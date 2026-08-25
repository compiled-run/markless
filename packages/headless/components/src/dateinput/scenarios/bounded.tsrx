import { dateinput } from '../../index.ts';

// A booking window. The date is inside it; stepping past either end pulls the
// whole date back to the bound, which can move all three boxes at once.
export default function Bounded() @{
	<dateinput.root
		value="2024-03-15"
		min="2024-03-10"
		max="2024-03-20"
		name="stay"
		data-testid="root"
	>
		<dateinput.label data-testid="label">Arrival</dateinput.label>
		<dateinput.monthinput data-testid="monthinput" />
		<dateinput.dayinput data-testid="dayinput" />
		<dateinput.yearinput data-testid="yearinput" />
		<dateinput.field data-testid="field" />
	</dateinput.root>
}
