import { textbox } from '../../index.ts';

// A signup form: a single-line username beside a multi-line bio, two independent
// instances on one page.
export default function SignupForm() @{
	<form>
		<textbox.root name="username" data-testid="username-root">
			<textbox.label data-testid="username-label">Username</textbox.label>
			<textbox.input data-testid="username-input" />
		</textbox.root>
		<textbox.root name="bio" data-testid="bio-root">
			<textbox.label data-testid="bio-label">Bio</textbox.label>
			<textbox.textarea data-testid="bio-textarea" />
		</textbox.root>
	</form>
}
