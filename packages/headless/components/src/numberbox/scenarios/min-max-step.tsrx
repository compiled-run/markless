import { numberbox } from '../../index.ts';

// A bounded field in fractional steps. With no `role="spinbutton"` there is no
// `aria-valuemin`/`aria-valuemax`, so the range is written out in the description
// - which is the part a reader is told about through `aria-describedby`.
export default function MinMaxStep() @{
	<numberbox.root
		value={1.5}
		min={0.5}
		max={3}
		step={0.25}
		name="dose"
		data-testid="root"
	>
		<numberbox.label data-testid="label">Dose</numberbox.label>
		<numberbox.backtrigger data-testid="backtrigger">-</numberbox.backtrigger>
		<numberbox.input data-testid="input" />
		<numberbox.forwardtrigger data-testid="forwardtrigger">+</numberbox.forwardtrigger>
		<numberbox.description data-testid="description">
			A number between 0.5 and 3, in steps of 0.25.
		</numberbox.description>
		<numberbox.field data-testid="field" />
	</numberbox.root>
}
