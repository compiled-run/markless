import { page, userEvent } from 'vite-plus/test/browser';

/**
 * Move the real pointer off anything a test is about to mount.
 *
 * The cursor rests where the last gesture left it - the previous test's, or the
 * previous file's, since one browser page runs the whole lane. A tree mounting
 * under it takes a real `pointerover`, because Chromium re-hit-tests on mount
 * without the pointer moving: measured as a trusted `pointerover` landing on a
 * part 3-25ms into a test that had made no gesture yet. Hover-sensitive parts
 * then react to a hover nobody performed.
 *
 * Best-effort by design. A modal the previous test left open inerts every
 * sibling, the pad included, and it is marked a tick after this code could see
 * it - so the hover is given a short leash and its failure is swallowed rather
 * than reported against a test that is about something else.
 */
export async function parkPointerClearOfMount(): Promise<void> {
	const pad = document.createElement('div');
	pad.dataset.testid = 'pointer-parking-pad';
	pad.style.cssText = 'position:fixed;inset:0;z-index:2147483647';
	document.body.append(pad);
	try {
		await userEvent.hover(page.getByTestId('pointer-parking-pad'), {
			position: { x: pad.clientWidth - 2, y: pad.clientHeight - 2 },
			timeout: 1000,
		});
	} catch {
		// Nothing reachable to park on; the mount is happening under a cover anyway.
	} finally {
		pad.remove();
	}
}
