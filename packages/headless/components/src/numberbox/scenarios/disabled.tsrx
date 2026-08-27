import { numberbox } from '../../index.ts';

// Nobody may change this number: the input is out of the tab order and both step
// buttons are off.
export default function Disabled() @{
	<numberbox.root value={12} min={0} max={20} disabled name="quantity" data-testid="root">
		<numberbox.label data-testid="label">Quantity</numberbox.label>
		<numberbox.backtrigger data-testid="backtrigger">-</numberbox.backtrigger>
		<numberbox.input data-testid="input" />
		<numberbox.forwardtrigger data-testid="forwardtrigger">+</numberbox.forwardtrigger>
		<numberbox.field data-testid="field" />
	</numberbox.root>
}
