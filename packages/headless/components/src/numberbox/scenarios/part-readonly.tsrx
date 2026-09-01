import { numberbox } from '../../index.ts';

// The restriction is set on the control, not on the root. A part may add one and
// never remove one, so everything that changes the number has to see it - the
// triggers included, or a person steps a field they cannot type in.
export default function PartReadOnly() @{
	<numberbox.root value={12} min={0} max={20} name="quantity" data-testid="root">
		<numberbox.label data-testid="label">Quantity</numberbox.label>
		<numberbox.backtrigger data-testid="backtrigger">-</numberbox.backtrigger>
		<numberbox.input readonly data-testid="input" />
		<numberbox.forwardtrigger data-testid="forwardtrigger">+</numberbox.forwardtrigger>
		<numberbox.field data-testid="field" />
	</numberbox.root>
}
