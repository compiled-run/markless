import * as otp from '../index.ts';

// A code the page already knows part of: four characters land in the first four
// boxes and the last two stay empty.
export default function Prefilled() @{
	<otp.root length={6} value="1234" data-testid="root">
		<otp.field data-testid="field" aria-label="Verification code" />
		<otp.item index={0} data-testid="item-0" />
		<otp.item index={1} data-testid="item-1" />
		<otp.item index={2} data-testid="item-2" />
		<otp.item index={3} data-testid="item-3" />
		<otp.item index={4} data-testid="item-4" />
		<otp.item index={5} data-testid="item-5" />
	</otp.root>
}
