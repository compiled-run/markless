/**
 * Take the dev server's error overlay off the tester page.
 *
 * A row that pins a build refusal makes Vite paint `<vite-error-overlay>` over the
 * whole tester page. It is appended to the page that hosts the test iframe, not to
 * the iframe, so `cleanup()` never sees it and it outlives the file that provoked
 * it. While it is up, every real gesture in the lane lands on the overlay instead
 * of the page under it, and the iframe loses focus - measured as a `userEvent.click`
 * on a live, listening button producing no event of any kind inside the iframe.
 *
 * Returns how many overlays were taken down, so a row can pin the mechanism.
 */
export function clearDevServerErrorOverlay(): number {
	let removed = 0;
	for (const doc of hostDocuments()) {
		for (const overlay of Array.from(doc.querySelectorAll('vite-error-overlay'))) {
			overlay.remove();
			removed += 1;
		}
	}
	return removed;
}

function hostDocuments(): Document[] {
	const found: Document[] = [];
	let frame: Window | null = window;
	// Cross-origin ancestors throw on `.document`; stop at the first one.
	while (frame) {
		try {
			found.push(frame.document);
		} catch {
			break;
		}
		const up: Window = frame.parent;
		frame = up === frame ? null : up;
	}
	return found;
}
