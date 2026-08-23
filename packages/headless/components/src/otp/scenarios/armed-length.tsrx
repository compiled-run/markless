import * as otp from '../index.ts';

// Which code this screen asks for is decided once, before anything renders, so
// the boxes come out of an @if arm rather than being written flat. A FLIPPING
// arm is a different thing and the compiler refuses it today
// (MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED, recorded in otp.browser.ts), so the
// choice here is a module constant.
const isBackupCode = false;

export default function ArmedLength() @{
	<otp.root length={6} data-testid="root">
		<otp.field data-testid="field" aria-label="Verification code" />
		<div data-testid="boxes">
			@if (isBackupCode) {
				<div data-testid="backup-boxes">
					<otp.item index={0} data-testid="backup-item-0" />
					<otp.item index={1} data-testid="backup-item-1" />
					<otp.item index={2} data-testid="backup-item-2" />
					<otp.item index={3} data-testid="backup-item-3" />
					<otp.item index={4} data-testid="backup-item-4" />
					<otp.item index={5} data-testid="backup-item-5" />
					<otp.item index={6} data-testid="backup-item-6" />
					<otp.item index={7} data-testid="backup-item-7" />
				</div>
			} @else {
				<div data-testid="sms-boxes">
					<otp.item index={0} data-testid="sms-item-0" />
					<otp.item index={1} data-testid="sms-item-1" />
					<otp.item index={2} data-testid="sms-item-2" />
					<otp.item index={3} data-testid="sms-item-3" />
					<otp.item index={4} data-testid="sms-item-4" />
					<otp.item index={5} data-testid="sms-item-5" />
				</div>
			}
		</div>
	</otp.root>
}
