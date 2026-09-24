import { expect, test } from 'vitest';

// The overlay is painted on the tester page that hosts every file's iframe, so
// one refused fixture would otherwise cover the page for real pointer gestures
// in whichever file runs next.
function overlaysOnHostPages(): number {
	let count = 0;
	let frame: Window | null = window;
	while (frame) {
		try {
			count += frame.document.querySelectorAll('vite-error-overlay').length;
		} catch {
			break;
		}
		const up: Window = frame.parent;
		frame = up === frame ? null : up;
	}
	return count;
}

test('a fixture the build refuses paints no error overlay over the tester page', async () => {
	const response = await fetch(
		new URL('./tour-gates/nested-handle-page.tsrx?import', import.meta.url),
	);
	expect(response.status).toBe(500);
	await new Promise((resolve) => setTimeout(resolve, 500));
	expect(overlaysOnHostPages()).toBe(0);
});
