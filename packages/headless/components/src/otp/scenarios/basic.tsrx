import { otp } from '../../index.ts';

// The starter a consumer copies: six empty boxes over one real input. Nothing
// numbers them - a box shows the character it stands in front of.
export default function Basic() @{
	<otp.root data-testid="root">
		<otp.field data-testid="field" aria-label="Verification code" />
		<otp.item data-testid="item-0"><otp.itemindicator data-testid="indicator-0">|</otp.itemindicator></otp.item>
		<otp.item data-testid="item-1"><otp.itemindicator data-testid="indicator-1">|</otp.itemindicator></otp.item>
		<otp.item data-testid="item-2"><otp.itemindicator data-testid="indicator-2">|</otp.itemindicator></otp.item>
		<otp.item data-testid="item-3"><otp.itemindicator data-testid="indicator-3">|</otp.itemindicator></otp.item>
		<otp.item data-testid="item-4"><otp.itemindicator data-testid="indicator-4">|</otp.itemindicator></otp.item>
		<otp.item data-testid="item-5"><otp.itemindicator data-testid="indicator-5">|</otp.itemindicator></otp.item>
	</otp.root>
}
