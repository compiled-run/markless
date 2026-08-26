import { numberbox } from '../../index.ts';

// The starter a consumer copies: a labelled number with both step buttons, the
// formatted value as text, and the element a form submits.
export default function Basic() @{
	<numberbox.root name="quantity" data-testid="root">
		<numberbox.label data-testid="label">Quantity</numberbox.label>
		<numberbox.backtrigger data-testid="backtrigger">-</numberbox.backtrigger>
		<numberbox.input data-testid="input" />
		<numberbox.forwardtrigger data-testid="forwardtrigger">+</numberbox.forwardtrigger>
		<numberbox.valuelabel data-testid="valuelabel" />
		<numberbox.field data-testid="field" />
	</numberbox.root>
}
