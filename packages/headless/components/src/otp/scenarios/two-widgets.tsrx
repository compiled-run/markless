import { otp } from '../../index.ts';

// Two code fields on one page: an SMS code and an authenticator code, side by
// side. Typing in one must leave the other exactly where it was.
export default function TwoWidgets() @{
	<section>
		<otp.root length={4} data-testid="sms-root">
			<otp.field data-testid="sms-field" aria-label="SMS code" />
			<otp.item index={0} data-testid="sms-item-0" />
			<otp.item index={1} data-testid="sms-item-1" />
			<otp.item index={2} data-testid="sms-item-2" />
			<otp.item index={3} data-testid="sms-item-3" />
		</otp.root>
		<otp.root length={4} value="99" data-testid="app-root">
			<otp.field data-testid="app-field" aria-label="Authenticator code" />
			<otp.item index={0} data-testid="app-item-0" />
			<otp.item index={1} data-testid="app-item-1" />
			<otp.item index={2} data-testid="app-item-2" />
			<otp.item index={3} data-testid="app-item-3" />
		</otp.root>
	</section>
}
