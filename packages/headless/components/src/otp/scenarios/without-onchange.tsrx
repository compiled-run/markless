import { otp } from '../../index.ts';

// The same field with no callback at all. Typing still fills the boxes; the call
// site simply has nobody to tell.
export default function WithoutOnChange() @{
	<otp.root data-testid="root">
		<otp.field data-testid="field" aria-label="Verification code" />
		<otp.item data-testid="item-0" />
		<otp.item data-testid="item-1" />
		<otp.item data-testid="item-2" />
		<otp.item data-testid="item-3" />
	</otp.root>
}
