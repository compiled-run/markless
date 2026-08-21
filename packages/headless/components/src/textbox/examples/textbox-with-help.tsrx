import { textbox } from '../../index.ts';

// A field with help text under it. No error is mounted, so the control is valid.
export default function FieldWithHelp() @{
	<textbox.root data-testid="root">
		<textbox.label data-testid="label">Email</textbox.label>
		<textbox.description data-testid="description">We'll never share your email</textbox.description>
		<textbox.input data-testid="input" />
	</textbox.root>
}
