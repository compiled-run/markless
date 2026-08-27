import { numberbox } from '../../index.ts';

// A money field. `currency` is a code, not a format: the family asks `Intl` where
// this currency's symbol goes and accepts the same characters back when somebody
// types or pastes them in.
export default function Currency() @{
	<numberbox.root
		value={1299}
		min={0}
		step={0.01}
		currency="USD"
		name="price"
		data-testid="root"
	>
		<numberbox.label data-testid="label">Price</numberbox.label>
		<numberbox.backtrigger data-testid="backtrigger">-</numberbox.backtrigger>
		<numberbox.input data-testid="input" />
		<numberbox.forwardtrigger data-testid="forwardtrigger">+</numberbox.forwardtrigger>
		<numberbox.valuelabel data-testid="valuelabel" />
		<numberbox.field data-testid="field" />
	</numberbox.root>
}
