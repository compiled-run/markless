// macOS gives a window only to the user logged in at the screen; with nobody there /dev/console belongs to root and a browser launch waits forever.
import { statSync } from 'node:fs';

/** The uid that owns the console device, or null where the machine has none. */
export function consoleOwnerUid() {
	try {
		return statSync('/dev/console').uid;
	} catch {
		return null;
	}
}

/** Why a step that opens a browser window cannot run on this machine now, or null when it can. */
export function consoleSessionProblem(platform, ownerUid) {
	if (platform !== 'darwin' || ownerUid !== 0) return null;
	return [
		"Nobody is logged in at this Mac's screen (/dev/console belongs to root), so a browser window cannot open and this step would hang.",
		'To recover: log in at the screen (or through Screen Sharing), then run the command again. With automatic login on, restarting the Mac also logs the user back in.',
	].join('\n');
}
