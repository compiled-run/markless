import { virtual } from '@guidepup/virtual-screen-reader';
import type { ScreenReaderDriver } from './driver.ts';

/**
 * How many turns of the task queue `settleOnFocus` gives the reader to follow a
 * focus move.
 *
 * Turns, not milliseconds. This reader moves its cursor from a `focusin`
 * listener that opens with one `setTimeout(0)` hop, and `press()` can leave two
 * of those queued behind it, so two turns is the measured need. Counting turns
 * rather than time is what keeps the wait honest on a loaded lane: a busy main
 * thread makes each turn take longer without giving the reader fewer of them,
 * where a deadline in milliseconds would expire while the announcement was still
 * queued. The margin is for a lane whose other suites left work on the queue.
 */
const FOCUS_FOLLOW_TURNS = 60;

/** One turn of the task queue - the granularity this reader's own waits use. */
const queueTurn = () => new Promise<void>((resolve) => setTimeout(resolve));

/** Enough of an element to find it in the scenario, for a failure message. */
function describe(node: Node | null): string {
	const element = node as Element | null;
	if (!element?.getAttribute) return String(node);
	const name =
		element.getAttribute('data-testid') ?? element.getAttribute('role') ?? element.tagName;
	return `<${element.tagName.toLowerCase()} ${name}>`;
}

/**
 * The always-runnable driver: @guidepup/virtual-screen-reader is a screen
 * reader written in JavaScript, so it needs no assistive technology installed
 * and speaks into a variable instead of a sound card. It reads the same DOM
 * Chromium hands a real reader, which is why this lane runs in the browser
 * project rather than in jsdom - the family's parts are compiled .tsrx, and
 * their attributes, focus and event dispatch are only real in a real browser.
 */
export const virtualDriver: ScreenReaderDriver = {
	name: 'virtual',
	// The words this reader speaks, taken from its own output for our markup,
	// not from its docs. NVDA and VoiceOver drivers fill the same slots.
	vocabulary: {
		checkbox: 'checkbox',
		group: 'group',
		checked: 'checked',
		notChecked: 'not checked',
		partiallyChecked: 'partially checked',
		disabled: 'disabled',
		invalid: 'invalid',
		switch: 'switch',
		radiogroup: 'radiogroup',
		radio: 'radio',
		tablist: 'tablist',
		tab: 'tab',
		tabpanel: 'tabpanel',
		combobox: 'combobox',
		listbox: 'listbox',
		option: 'option',
		button: 'button',
		progressbar: 'progressbar',
		textbox: 'textbox',
		navigation: 'navigation',
		link: 'link',
		region: 'region',
		image: 'image',
		dialog: 'dialog',
		carousel: 'carousel',
		slide: 'slide',
		selected: 'selected',
		currentPage: 'current page',
		expanded: 'expanded',
		notExpanded: 'not expanded',
	},
	// Guidepup's docs spell the toggle key "Space", which its press() forwards to
	// user-event as `{Space}`; user-event has no key by that name, so the button
	// activation behaviour never runs and nothing toggles. The character does.
	// The arrow keys are user-event's own names and need no such correction.
	keys: { space: ' ', enter: 'Enter', arrowDown: 'ArrowDown', arrowRight: 'ArrowRight' },
	segments: (phrase) => phrase.split(', '),
	start: (container) => virtual.start({ container }),
	stop: () => virtual.stop(),
	next: () => virtual.next(),
	previous: () => virtual.previous(),
	press: (key) => virtual.press(key),
	async reannounce() {
		// This reader has no "read the current item again" command, so step off
		// the item and back onto it, which re-reads it from the live DOM.
		await virtual.previous();
		await virtual.next();
		return virtual.lastSpokenPhrase();
	},
	async settleOnFocus() {
		for (let turn = 0; turn < FOCUS_FOLLOW_TURNS; turn++) {
			const focused = document.activeElement;
			if (focused && virtual.activeNode === focused) return virtual.lastSpokenPhrase();
			await queueTurn();
		}
		throw new Error(
			`virtual never followed the focus to ${describe(document.activeElement)}: its cursor ` +
				`stayed on ${describe(virtual.activeNode)} after ${FOCUS_FOLLOW_TURNS} turns of the ` +
				`task queue. An element the reader has no node for - one that is hidden, or outside ` +
				`the container start() was given - is the reason to look for first.`,
		);
	},
	lastSpokenPhrase: () => virtual.lastSpokenPhrase(),
	// The reader hands back its own log array, which keeps growing under the
	// caller's feet; a copy is what a test can hold on to.
	spokenPhraseLog: async () => [...(await virtual.spokenPhraseLog())],
	clearSpokenPhraseLog: () => virtual.clearSpokenPhraseLog(),
};
