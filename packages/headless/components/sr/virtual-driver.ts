import { virtual } from '@guidepup/virtual-screen-reader';
import type { ScreenReaderDriver } from './driver.ts';

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
	// not from its docs. NVDA and VoiceOver drivers fill the same six slots.
	vocabulary: {
		checkbox: 'checkbox',
		checked: 'checked',
		notChecked: 'not checked',
		partiallyChecked: 'partially checked',
		disabled: 'disabled',
		invalid: 'invalid',
	},
	// Guidepup's docs spell the toggle key "Space", which its press() forwards to
	// user-event as `{Space}`; user-event has no key by that name, so the button
	// activation behaviour never runs and nothing toggles. The character does.
	keys: { space: ' ', enter: 'Enter' },
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
	lastSpokenPhrase: () => virtual.lastSpokenPhrase(),
	// The reader hands back its own log array, which keeps growing under the
	// caller's feet; a copy is what a test can hold on to.
	spokenPhraseLog: async () => [...(await virtual.spokenPhraseLog())],
	clearSpokenPhraseLog: () => virtual.clearSpokenPhraseLog(),
};
