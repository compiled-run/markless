import { textbox } from '../index.ts';

// A signup form: a single-line username beside a multi-line bio. Two independent
// instances, which is what a real page looks like and what proves a keystroke in
// one field leaves the other alone.
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
