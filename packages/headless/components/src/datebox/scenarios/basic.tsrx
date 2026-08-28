import { datebox } from '../../index.ts';

// The starter a consumer copies: a labelled date, month before day, with the
// element a form submits.
export default function Basic() @{
	<datebox.root name="starts" data-testid="root">
		<datebox.label data-testid="label">Start date</datebox.label>
		<datebox.monthinput data-testid="monthinput" />
		<datebox.dayinput data-testid="dayinput" />
		<datebox.yearinput data-testid="yearinput" />
		<datebox.field data-testid="field" />
	</datebox.root>
}
