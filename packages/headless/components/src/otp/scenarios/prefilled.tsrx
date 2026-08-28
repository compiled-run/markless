import { otp } from '../../index.ts';

// A code the page already knows part of: four characters land in the first four
// boxes and the last two stay empty.
export default function Prefilled() @{
	<otp.root value="1234" data-testid="root">
		<otp.field data-testid="field" aria-label="Verification code" />
		<otp.item data-testid="item-0" />
		<otp.item data-testid="item-1" />
		<otp.item data-testid="item-2" />
		<otp.item data-testid="item-3" />
		<otp.item data-testid="item-4" />
		<otp.item data-testid="item-5" />
	</otp.root>
}
