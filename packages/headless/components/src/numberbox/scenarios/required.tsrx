import { numberbox } from '../../index.ts';

// A field a form will not submit empty. The requirement is reported by the input
// the person types into and by the hidden element the form reads.
export default function Required() @{
	<numberbox.root required name="seats" data-testid="root">
		<numberbox.label data-testid="label">Seats</numberbox.label>
		<numberbox.input data-testid="input" />
		<numberbox.field data-testid="field" />
	</numberbox.root>
}
