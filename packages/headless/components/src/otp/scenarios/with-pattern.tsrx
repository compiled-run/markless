import * as otp from '../index.ts';

// The careful attribute set the wild writes by hand: a `pattern` on the input
// alongside everything the family already sets. `maxlength` and `autocomplete`
// are written here too, and the family's own values win — the spread comes
// first, so a consumer adds attributes and never replaces the family's.
export default function WithPattern() @{
	<otp.root length={6} data-testid="root">
		<otp.field
			data-testid="field"
			aria-label="Verification code"
			pattern="[0-9]*"
			minlength={6}
			maxlength={2}
			autocomplete="off"
		/>
		<otp.item index={0} data-testid="item-0" />
		<otp.item index={1} data-testid="item-1" />
		<otp.item index={2} data-testid="item-2" />
		<otp.item index={3} data-testid="item-3" />
		<otp.item index={4} data-testid="item-4" />
		<otp.item index={5} data-testid="item-5" />
	</otp.root>
}
