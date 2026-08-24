import { state } from '@markless/core';
import { otp } from '../../index.ts';

// The shape almost every sign-in flow hand-rolls: a labelled code field inside a
// form with a submit button. The label wraps the field, so it names the one real
// input with no id wiring at all, and the form submits what the browser itself
// put in the FormData.
export default function VerificationForm() @{
	let submitted = state('');

	<form
		data-testid="form"
		onSubmit={(event) => {
			event.preventDefault();
			submitted = JSON.stringify(Object.fromEntries(new FormData(event.target as HTMLFormElement)));
		}}
	>
		<otp.root data-testid="root">
			<label data-testid="label">Verification code<otp.field name="code" data-testid="field" /></label>
			<div data-testid="boxes">
				<otp.item index={0} data-testid="item-0" />
				<otp.item index={1} data-testid="item-1" />
				<otp.item index={2} data-testid="item-2" />
				<otp.item index={3} data-testid="item-3" />
				<otp.item index={4} data-testid="item-4" />
				<otp.item index={5} data-testid="item-5" />
			</div>
		</otp.root>
		<button type="submit" data-testid="submit">Verify</button>
		<output data-testid="submitted">{submitted}</output>
	</form>
}
