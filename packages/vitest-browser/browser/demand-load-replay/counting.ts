import { page, userEvent } from 'vite-plus/test/browser';
import { expect } from 'vitest';

/** Errors a refused dispatch raises, which no assertion on text would catch. */
export function watchForThrows(): { readonly seen: string[]; readonly stop: () => void } {
	const seen: string[] = [];
	const onError = (event: ErrorEvent) => void seen.push(String(event.error ?? event.message));
	const onRejection = (event: PromiseRejectionEvent) => {
		event.preventDefault();
		seen.push(String(event.reason));
	};
	window.addEventListener('error', onError);
	window.addEventListener('unhandledrejection', onRejection);
	return {
		seen,
		stop: () => {
			window.removeEventListener('error', onError);
			window.removeEventListener('unhandledrejection', onRejection);
		},
	};
}

/**
 * Put the cursor in the viewport corner BEFORE a page mounts. A page mounting
 * under a resting cursor takes a real `pointerenter` of its own, which is a
 * second gesture rather than a second dispatch of the one under test - and the
 * cursor is wherever the previous test file left it.
 */
export async function parkPointerBeforeMount(): Promise<void> {
	const pad = document.createElement('div');
	pad.dataset.testid = 'pointer-parking-pad';
	pad.style.cssText = 'position:fixed;inset:0;z-index:2147483647';
	document.body.append(pad);
	try {
		await userEvent.hover(page.getByTestId('pointer-parking-pad'), {
			position: { x: 1, y: 1 },
		});
	} finally {
		pad.remove();
	}
}

/**
 * The count once it stops moving. A one-shot read cannot tell a single dispatch
 * from the first of two, so the value has to be quiet before it is asserted.
 */
export async function settledCount(read: () => number): Promise<number> {
	await expect.poll(read).toBeGreaterThan(0);
	let last = read();
	for (let quiet = 0; quiet < 3; ) {
		await new Promise((resolve) => setTimeout(resolve, 60));
		const next = read();
		quiet = next === last ? quiet + 1 : 0;
		last = next;
	}
	return last;
}
