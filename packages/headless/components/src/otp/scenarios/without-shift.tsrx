import { otp } from '../../index.ts';

// A code field on a page with no password manager to make room for: the field
// covers the boxes and stops at the root's edge, nothing wider.
export default function WithoutShift() @{
	<otp.root shiftPWManagers={false} data-testid="root">
		<otp.field data-testid="field" aria-label="Verification code" />
		<otp.item index={0} data-testid="item-0">|</otp.item>
		<otp.item index={1} data-testid="item-1">|</otp.item>
		<otp.item index={2} data-testid="item-2">|</otp.item>
		<otp.item index={3} data-testid="item-3">|</otp.item>
	</otp.root>
}
