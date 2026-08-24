import { otp } from '../../index.ts';

// The starter a consumer copies: six empty boxes over one real input, and each
// box says which character of the code it shows.
export default function Basic() @{
	<otp.root data-testid="root">
		<otp.field data-testid="field" aria-label="Verification code" />
		<otp.item index={0} data-testid="item-0"><otp.itemindicator data-testid="indicator-0">|</otp.itemindicator></otp.item>
		<otp.item index={1} data-testid="item-1"><otp.itemindicator data-testid="indicator-1">|</otp.itemindicator></otp.item>
		<otp.item index={2} data-testid="item-2"><otp.itemindicator data-testid="indicator-2">|</otp.itemindicator></otp.item>
		<otp.item index={3} data-testid="item-3"><otp.itemindicator data-testid="indicator-3">|</otp.itemindicator></otp.item>
		<otp.item index={4} data-testid="item-4"><otp.itemindicator data-testid="indicator-4">|</otp.itemindicator></otp.item>
		<otp.item index={5} data-testid="item-5"><otp.itemindicator data-testid="indicator-5">|</otp.itemindicator></otp.item>
	</otp.root>
}
