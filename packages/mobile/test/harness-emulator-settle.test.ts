import { describe, expect, it } from 'vitest';
import { focusedWindowIn, waitButtonIn } from '../src/harness/emulator-screen.ts';

describe('emulator settling', () => {
	it('reads the focused window from dumpsys, and none while focus is null', () => {
		const dialog = [
			'WINDOW MANAGER DISPLAY CONTENTS (dumpsys window displays)',
			'  Display: mDisplayId=0 rotation=0',
			'  mCurrentFocus=Window{7aacac3 u0 Application Not Responding: com.android.systemui}',
			'  mFocusedApp=ActivityRecord{1 u0 com.google.android.apps.nexuslauncher/.NexusLauncherActivity t2}',
		].join('\n');
		expect(focusedWindowIn(dialog)).toBe(
			'Window{7aacac3 u0 Application Not Responding: com.android.systemui}',
		);
		expect(focusedWindowIn('  mCurrentFocus=null\n')).toBeUndefined();
		expect(focusedWindowIn('')).toBeUndefined();
	});

	it("finds the centre of the dialog's Wait button, and nothing on a screen without one", () => {
		const screen =
			'<hierarchy rotation="0"><node index="0" text="System UI isn\'t responding" resource-id="android:id/alertTitle" bounds="[84,1000][996,1080]" />' +
			'<node index="1" text="Close app" resource-id="android:id/aerr_close" bounds="[84,1120][996,1240]" />' +
			'<node index="2" text="Wait" resource-id="android:id/aerr_wait" bounds="[84,1240][996,1360]" /></hierarchy>';
		expect(waitButtonIn(screen)).toEqual({ x: 540, y: 1300 });
		expect(
			waitButtonIn(
				'<hierarchy rotation="0"><node index="0" bounds="[0,0][1080,2400]" /></hierarchy>',
			),
		).toBeUndefined();
	});
});
