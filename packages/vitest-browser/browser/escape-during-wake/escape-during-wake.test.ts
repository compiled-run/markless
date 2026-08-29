import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSR } from '../../src/index.ts';
import EscapeDuringWakePage from './escape-during-wake-page.tsrx';

// The window the Escape primer exists for does not end when the page starts
// waking. A wake is a dynamic import; the overlay behaviour - and with it the
// document listener that reports Escape - installs only once that import lands.
// A page whose runtime was woken by an earlier gesture therefore still has
// nothing listening for the keyboard, and an Escape arriving in between reaches
// neither the primer nor the behaviour unless the primer keeps taking it.
//
// Focus is what makes that ordering certain rather than lucky: the waker button
// carries a click record, so focus arriving on it starts the wake synchronously,
// and an Escape dispatched in the same task cannot be behind the import.

afterEach(async () => {
	for (const surface of document.querySelectorAll<HTMLElement>('[overlay]')) surface.hidden = true;
	// MutationObserver callbacks are microtasks, so the releases are not done yet.
	await new Promise((resolve) => setTimeout(resolve, 0));
	cleanup();
	(globalThis as { __marklessOverlayPrimedDismissal?: unknown }).__marklessOverlayPrimedDismissal =
		undefined;
});

function requireElement<T extends Element>(container: ParentNode, selector: string): T {
	const found = container.querySelector<T>(selector);
	if (!found) throw new Error(`Expected "${selector}" in the rendered DOM.`);
	return found;
}

test('SSR resume: an Escape pressed while the page is already waking still dismisses', async () => {
	const screen = await renderSSR(EscapeDuringWakePage);
	expect(requireElement<HTMLElement>(screen.container, '[data-surface]').hidden).toBe(false);

	const waker = requireElement<HTMLButtonElement>(screen.container, '[data-waker]');
	waker.focus();
	waker.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

	await expect
		.poll(() => requireElement<HTMLElement>(screen.container, '[data-surface]').hidden)
		.toBe(true);
	expect(requireElement(screen.container, '[data-dismissals]').textContent).toBe('1');
});

// The other half of the same primer, pinned here so the window above cannot be
// widened by dropping it: a page nothing has touched at all still has to take
// the very first Escape.
test('SSR resume: an Escape on an untouched page is still the press that dismisses', async () => {
	const screen = await renderSSR(EscapeDuringWakePage);
	expect(requireElement<HTMLElement>(screen.container, '[data-surface]').hidden).toBe(false);

	document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

	await expect
		.poll(() => requireElement<HTMLElement>(screen.container, '[data-surface]').hidden)
		.toBe(true);
	expect(requireElement(screen.container, '[data-dismissals]').textContent).toBe('1');
});
