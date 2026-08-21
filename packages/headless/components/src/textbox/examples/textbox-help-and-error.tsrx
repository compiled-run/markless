import { textbox } from '../../index.ts';

// Help text and a validation error at once, which is what a submitted form
// usually shows.
export default function FieldWithHelpAndError() @{
	<textbox.root data-testid="root">
		<textbox.label data-testid="label">Email</textbox.label>
		<textbox.description data-testid="description">Enter a valid email address</textbox.description>
		<textbox.input data-testid="input" />
		<textbox.error data-testid="error">Email format is invalid</textbox.error>
	</textbox.root>
}
