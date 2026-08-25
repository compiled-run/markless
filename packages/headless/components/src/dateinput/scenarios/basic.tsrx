import { dateinput } from '../../index.ts';

// The starter a consumer copies: a labelled date, month before day, with the
// element a form submits.
export default function Basic() @{
	<dateinput.root name="starts" data-testid="root">
		<dateinput.label data-testid="label">Start date</dateinput.label>
		<dateinput.monthinput data-testid="monthinput" />
		<dateinput.dayinput data-testid="dayinput" />
		<dateinput.yearinput data-testid="yearinput" />
		<dateinput.field data-testid="field" />
	</dateinput.root>
}
