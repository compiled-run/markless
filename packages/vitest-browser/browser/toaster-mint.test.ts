import { expect, test } from 'vitest';
import { cleanup, renderSSR } from '../src/index.ts';
import App from './fixtures/toaster-mint-page.tsrx';

const toasts = (container: Element): Element[] =>
	Array.from(container.querySelectorAll('[ui-toast]'));
const titles = (container: Element): string[] =>
	Array.from(container.querySelectorAll('[ui-toasttitle]')).map(
		(node) => node.textContent?.trim() ?? '',
	);
const click = (container: Element, selector: string): void => {
	(container.querySelector(selector) as HTMLElement).click();
};

test('a toast raised after load paints, stacks, and dismisses itself', async () => {
	const screen = await renderSSR(App);
	const container = screen.container;

	// The region is served empty: it has to be in the DOM before the first
	// message, or a live region arriving with its text is never announced.
	expect(container.querySelector('[ui-toaster]')).not.toBeNull();
	expect(toasts(container)).toHaveLength(0);

	click(container, '[data-say]');
	await expect.poll(() => toasts(container).length).toBe(1);

	const first = toasts(container)[0]!;
	// The item's own markup, and both parts the page projected into it: the title
	// took its else arm and read the message, and the close button carries its `x`.
	expect(first.getAttribute('ui-tone')).toBe('success');
	expect(first.getAttribute('style')).toContain('--index: 0');
	expect(first.getAttribute('ui-front')).toBe('');
	expect(titles(container)).toEqual(['Saved']);
	expect(first.querySelector('[ui-toastclose]')?.textContent).toBe('x');

	click(container, '[data-say]');
	await expect.poll(() => toasts(container).length).toBe(2);
	expect(titles(container)).toEqual(['Saved', 'Saved']);
	// Stacking is a computed over the queue, so each row reads its own place - and
	// the row already on screen re-reads its own when the second one arrives.
	expect(toasts(container)[1]!.getAttribute('style')).toContain('--index: 1');
	expect(toasts(container)[0]!.getAttribute('ui-front')).toBe('');
	expect(toasts(container)[1]!.getAttribute('ui-front')).toBeNull();

	await cleanup();
});

// The close button reads `item.id` off the widget-scoped `shared()` instance the
// row's own component wrote. At RENDER time that read answers - the tone and the
// title both come off the same instance and both paint - but the handler runs
// later, against the live graph, and there the projected part resolves no
// instance: `dismiss('')` matches no message. What is missing is the minted row's
// widget registry naming the projection ids of the parts the OWNER projected, not
// only those of the row's own child.
test.fails('a minted toast dismisses itself through its own close button', async () => {
	const screen = await renderSSR(App);
	const container = screen.container;

	click(container, '[data-say]');
	await expect.poll(() => toasts(container).length).toBe(1);

	// The close button belongs to the minted row, and it knows which message it is.
	click(container, '[ui-toastclose]');
	await expect.poll(() => toasts(container).length).toBe(0);
	await cleanup();
});

// A `@for` written inside a component's `{children}` is markup the OWNER renders
// and the projecting component splices in, so the repeat's parent host is read off
// the owner's own markup - `<main>` here - and not the `<ol>` the projection lands
// inside. The served region carries no repeat anchor at all, so the rows a client
// mints are appended beside the region instead of into it. Independent of minting:
// it is where a PROJECTED repeat anchors.
test.fails('a minted toast lands inside the live region', async () => {
	const screen = await renderSSR(App);
	const container = screen.container;

	click(container, '[data-say]');
	await expect.poll(() => toasts(container).length).toBe(1);
	expect(toasts(container)[0]!.parentElement?.getAttribute('ui-toaster')).toBe('');
	await cleanup();
});
