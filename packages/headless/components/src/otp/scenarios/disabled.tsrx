import { otp } from '../../index.ts';

// A code field nobody may type in yet, and one that is locked part-way through —
// the shape a "resend in 30s" screen shows while it waits.
export default function Disabled() @{
	<section>
		<otp.root disabled data-testid="empty-root">
			<otp.field data-testid="empty-field" aria-label="Verification code" />
			<otp.item data-testid="empty-item-0" />
			<otp.item data-testid="empty-item-1" />
			<otp.item data-testid="empty-item-2" />
			<otp.item data-testid="empty-item-3" />
		</otp.root>
		<otp.root value="12" disabled data-testid="partial-root">
			<otp.field data-testid="partial-field" aria-label="Backup code" />
			<otp.item data-testid="partial-item-0" />
			<otp.item data-testid="partial-item-1" />
			<otp.item data-testid="partial-item-2" />
			<otp.item data-testid="partial-item-3" />
		</otp.root>
	</section>
}
