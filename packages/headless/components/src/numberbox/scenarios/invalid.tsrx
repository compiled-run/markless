import { numberbox } from '../../index.ts';

// Two fields marked wrong two ways: one by the root prop, one by mounting the
// error part. The second writes its error BEFORE the input, so a test can show
// that document order does not decide what a part reads.
export default function Invalid() @{
	<section>
		<numberbox.root value={0} invalid name="flagged" data-testid="flagged-root">
			<numberbox.label data-testid="flagged-label">Flagged quantity</numberbox.label>
			<numberbox.input data-testid="flagged-input" />
		</numberbox.root>
		<numberbox.root value={0} name="quantity" data-testid="root">
			<numberbox.error data-testid="error">Enter at least one.</numberbox.error>
			<numberbox.label data-testid="label">Quantity</numberbox.label>
			<numberbox.input data-testid="input" />
			<numberbox.description data-testid="description">
				A whole number, one or more.
			</numberbox.description>
			<numberbox.field data-testid="field" />
		</numberbox.root>
	</section>
}
