import { textbox } from '../index.ts';

// The starter a consumer copies: a labelled single-line field.
export default function Basic() @{
	<textbox.root name="username" data-testid="root">
		<textbox.label data-testid="label">Username</textbox.label>
		<textbox.input data-testid="input" />
	</textbox.root>
}
