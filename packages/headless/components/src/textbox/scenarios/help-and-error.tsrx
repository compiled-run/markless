import { textbox } from '../../index.ts';

// Help text and a validation error at once, which is what a submitted form
// usually shows. The hint is written above the error and both controls still
// name the error first, so the order comes from the family rather than from
// where the parts sit in the page.
export default function FieldWithHelpAndError() @{
	<textbox.root data-testid="root">
		<textbox.label data-testid="label">Email</textbox.label>
		<textbox.description data-testid="description">Enter a valid email address</textbox.description>
		<textbox.input data-testid="input" />
		<textbox.textarea data-testid="textarea" />
		<textbox.error data-testid="error">Email format is invalid</textbox.error>
	</textbox.root>
}
