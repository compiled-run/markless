import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './context-gate.tsrx';

// A widget root binds `onContextmenu` and cancels the default action. On a
// served document the handler symbol is not loaded yet when the first gesture
// arrives, so every row here mounts fresh: only the FIRST gesture on a page is
// inside the demand-load window.
afterEach(() => cleanup());

// The gesture waits on the handler module's fetch, so the polls are given more
// than the one-second default.
const COLD_POLL = { timeout: 5000 };
// How long a row that expects NOTHING to arrive waits before saying so.
const QUIET_MS = 1200;

function el<T extends Element = HTMLElement>(testid: string): T {
	const found = page.getByTestId(testid).element();
	if (!found) throw new Error(`Expected [data-testid="${testid}"] to be on the page.`);
	return found as unknown as T;
}

const hits = () => Number(el('cg-hits').textContent);
const keys = () => Number(el('cg-keys').textContent);
const lastKey = () => el('cg-lastkey').textContent;
const button = () => Number(el('cg-button').textContent);
const phase = () => Number(el('cg-phase').textContent);
const position = () => [Number(el('cg-x').textContent), Number(el('cg-y').textContent)] as const;

const quiet = () => new Promise((resolve) => setTimeout(resolve, QUIET_MS));

type ContextProbe = {
	/** `defaultPrevented` read once per event on the way back out of the dispatch. */
	readonly cancelledInDispatch: boolean[];
	/** The same events, kept live so the flag can be read again long afterwards. */
	readonly seen: Event[];
	readonly stop: () => void;
};

/**
 * A driver cannot see the native menu, so the witness is the cancelled flag the
 * browser itself checks: whatever it reads once dispatch returns. A window
 * bubble listener is the last thing in that dispatch, so it reads exactly that.
 * The same flag read off the stashed event later says only that preventDefault
 * ran at SOME point, which is a weaker claim and the one this separates out.
 */
function watchContextmenu(): ContextProbe {
	const cancelledInDispatch: boolean[] = [];
	const seen: Event[] = [];
	const stash = (event: Event) => void seen.push(event);
	const readAtEnd = (event: Event) => void cancelledInDispatch.push(event.defaultPrevented);
	document.addEventListener('contextmenu', stash, true);
	window.addEventListener('contextmenu', readAtEnd, false);
	return {
		cancelledInDispatch,
		seen,
		stop: () => {
			document.removeEventListener('contextmenu', stash, true);
			window.removeEventListener('contextmenu', readAtEnd, false);
		},
	};
}

const rightClickTarget = () => userEvent.click(page.getByTestId('cg-target'), { button: 'right' });

/** Focus is not a gesture, so it does not spend the demand-load window the keys are measured across. */
function focusRoot(): void {
	el<HTMLElement>('cg-root').focus();
}

/** True where a keyboard-origin contextmenu puts itself: the viewport origin, or the focused box. */
function isKeyboardOrigin(x: number, y: number, box: DOMRect): boolean {
	if (x === 0 && y === 0) return true;
	return x >= box.left - 1 && x <= box.right + 1 && y >= box.top - 1 && y <= box.bottom + 1;
}

// ── The pointer gesture ────────────────────────────────────────────────────

test('SSR cold first right-click: the handler runs and the default action is cancelled inside the dispatch', async () => {
	const probe = watchContextmenu();
	try {
		await renderSSR(Page);
		await rightClickTarget();
		await expect.poll(hits, COLD_POLL).toBe(1);
		expect(button()).toBe(2);
		expect(probe.cancelledInDispatch).toEqual([true]);
	} finally {
		probe.stop();
	}
});

// What cancels it is NOT the handler: the handler runs after the dispatch has
// returned, which `eventPhase` of 0 is the witness for. The cancel comes from
// the inline resumer applying the extracted synchronous policy in its own
// capture listener, before the handler module is even fetched.
test('SSR cold first right-click: the handler itself runs after the dispatch has returned', async () => {
	await renderSSR(Page);
	await rightClickTarget();
	await expect.poll(hits, COLD_POLL).toBe(1);
	expect(phase()).toBe(0);
});

test('SSR: the right-click after the cold one still reaches the handler', async () => {
	const probe = watchContextmenu();
	try {
		await renderSSR(Page);
		await rightClickTarget();
		await expect.poll(hits, COLD_POLL).toBe(1);
		await rightClickTarget();
		await expect.poll(hits, COLD_POLL).toBe(2);
		expect(probe.cancelledInDispatch).toEqual([true, true]);
	} finally {
		probe.stop();
	}
});

test('CSR: a right-click reaches the handler', async () => {
	await render(Page);
	await rightClickTarget();
	await expect.poll(hits).toBe(1);
	expect(button()).toBe(2);
});

// What cancels it on a client render is not the handler either: the handler
// still arrives after the dispatch has returned (phase 0) and its own
// preventDefault() is far too late for the browser. The cancel the row below
// measures comes from somewhere else.
test('CSR: the handler itself runs after the dispatch has returned', async () => {
	const probe = watchContextmenu();
	try {
		await render(Page);
		await rightClickTarget();
		await expect.poll(hits).toBe(1);
		expect(phase()).toBe(0);
		await expect.poll(() => probe.seen[0]?.defaultPrevented).toBe(true);
	} finally {
		probe.stop();
	}
});

// The container listener applies the compiler-extracted synchronous policy
// itself, before it awaits the demand-loaded handler, so a client-rendered
// right-click is cancelled on the same beat a served one is.
test('CSR: the right-click default action is cancelled inside the dispatch', async () => {
	const probe = watchContextmenu();
	try {
		await render(Page);
		await rightClickTarget();
		await expect.poll(hits).toBe(1);
		expect(probe.cancelledInDispatch).toEqual([true]);
	} finally {
		probe.stop();
	}
});

// ── The keyboard route to the same menu ────────────────────────────────────

// The key itself always reaches the page - the handler counts it and names it.
// Whether a contextmenu event then follows is the driver's choice, not the
// framework's: headless macOS Chromium never synthesizes one from the keyboard,
// headless Linux Chromium does. The framework invariant a row can pin on every
// platform is consistency - the handler fires exactly as often as the event
// exists, never more (a phantom dispatch) and never less (a swallowed one).
test('CSR: Shift+F10 reaches the page as a keydown; the handler fires exactly when a contextmenu follows', async () => {
	const probe = watchContextmenu();
	try {
		await render(Page);
		focusRoot();
		await userEvent.keyboard('{Shift>}{F10}{/Shift}');
		await expect.poll(lastKey).toBe('F10');
		expect(keys()).toBeGreaterThan(0);
		await quiet();
		expect(hits()).toBe(probe.seen.length);
	} finally {
		probe.stop();
	}
});

test('CSR: the ContextMenu key reaches the page as a keydown; the handler fires exactly when a contextmenu follows', async () => {
	const probe = watchContextmenu();
	try {
		await render(Page);
		focusRoot();
		await userEvent.keyboard('{ContextMenu}');
		await expect.poll(lastKey).toBe('ContextMenu');
		await quiet();
		expect(hits()).toBe(probe.seen.length);
	} finally {
		probe.stop();
	}
});

// PINNED. Headless Chromium driven over the debug protocol does not turn
// Shift+F10 into a contextmenu event: the browser-process shortcut that does
// that on a real desktop is not on this path, so the keydown arrives and
// nothing else does. Not a framework limit - no contextmenu event exists for
// any listener to receive. A keyboard route to a context menu therefore cannot
// be witnessed here by the key alone; a family that wants one has to open on
// the keydown itself.
test.fails('SSR cold: Shift+F10 on the focused root reaches the handler', async () => {
	await renderSSR(Page);
	focusRoot();
	const box = el<HTMLElement>('cg-root').getBoundingClientRect();
	await userEvent.keyboard('{Shift>}{F10}{/Shift}');
	await expect.poll(hits, COLD_POLL).toBe(1);
	expect(button()).toBe(0);
	const [x, y] = position();
	expect(isKeyboardOrigin(x, y, box), `keyboard contextmenu at ${x},${y}`).toBe(true);
});

// PINNED. Same mechanism as the row above, for the dedicated ContextMenu key.
test.fails('SSR cold: the ContextMenu key on the focused root reaches the handler', async () => {
	await renderSSR(Page);
	focusRoot();
	const box = el<HTMLElement>('cg-root').getBoundingClientRect();
	await userEvent.keyboard('{ContextMenu}');
	await expect.poll(hits, COLD_POLL).toBe(1);
	expect(button()).toBe(0);
	const [x, y] = position();
	expect(isKeyboardOrigin(x, y, box), `keyboard contextmenu at ${x},${y}`).toBe(true);
});

// The client-render halves of the consistency rows above: same driver-dependent
// synthesis, so the pin is again hits-match-events rather than either platform's
// absolute.
test('CSR: Shift+F10 on the focused root reaches the handler exactly when the browser synthesizes the event', async () => {
	const probe = watchContextmenu();
	try {
		await render(Page);
		focusRoot();
		await userEvent.keyboard('{Shift>}{F10}{/Shift}');
		await quiet();
		expect(hits()).toBe(probe.seen.length);
	} finally {
		probe.stop();
	}
});

test('CSR: the ContextMenu key on the focused root reaches the handler exactly when the browser synthesizes the event', async () => {
	const probe = watchContextmenu();
	try {
		await render(Page);
		focusRoot();
		await userEvent.keyboard('{ContextMenu}');
		await quiet();
		expect(hits()).toBe(probe.seen.length);
	} finally {
		probe.stop();
	}
});
