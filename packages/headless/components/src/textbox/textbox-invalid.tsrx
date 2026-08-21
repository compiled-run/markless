import { textbox } from '../index.ts';

// A field that failed validation. Mounting the error part at all is what marks
// the control invalid — and it works whether the consumer writes the error after
// the control or before it, because seeding completes before any part renders.
export default function InvalidField() @{
	<section>
		<textbox.root data-testid="after-root">
			<textbox.label data-testid="after-label">Password</textbox.label>
			<textbox.input data-testid="after-input" />
			<textbox.error data-testid="after-error">Password is required</textbox.error>
		</textbox.root>
		<textbox.root data-testid="before-root">
			<textbox.error data-testid="before-error">Password is required</textbox.error>
			<textbox.label data-testid="before-label">Password</textbox.label>
			<textbox.input data-testid="before-input" />
		</textbox.root>
	</section>
}
