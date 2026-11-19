/** Reading an Android emulator's screen state from adb shell output, apart from the harness that drives it. */

/** The window holding input focus in `dumpsys window displays` output, or undefined while none does. */
export function focusedWindowIn(windows: string): string | undefined {
	const line = windows.split('\n').find((text) => text.trim().startsWith('mCurrentFocus='));
	const focus = line?.trim().slice('mCurrentFocus='.length);
	return focus && focus !== 'null' ? focus : undefined;
}

/** The centre of a not-responding dialog's "Wait" button in a uiautomator screen dump. */
export function waitButtonIn(
	screen: string,
): { readonly x: number; readonly y: number } | undefined {
	const node = screen
		.split('<node ')
		.find((text) => text.includes('resource-id="android:id/aerr_wait"'));
	const bounds = node?.split('bounds="')[1]?.split('"')[0];
	const corners = bounds
		?.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/)
		?.slice(1)
		.map(Number);
	if (!corners) return undefined;
	const [left, top, right, bottom] = corners as [number, number, number, number];
	return { x: Math.round((left + right) / 2), y: Math.round((top + bottom) / 2) };
}
