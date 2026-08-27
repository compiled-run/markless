import { numberbox } from '../../index.ts';

// The number can be read, selected and copied, but not changed. The input stays
// focusable - a value nobody can reach is a value nobody can read.
export default function ReadOnly() @{
	<numberbox.root value={12} min={0} max={20} readonly name="quantity" data-testid="root">
		<numberbox.label data-testid="label">Quantity</numberbox.label>
		<numberbox.backtrigger data-testid="backtrigger">-</numberbox.backtrigger>
		<numberbox.input data-testid="input" />
		<numberbox.forwardtrigger data-testid="forwardtrigger">+</numberbox.forwardtrigger>
		<numberbox.field data-testid="field" />
	</numberbox.root>
}
