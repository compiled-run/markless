import type { NVDAPlaywright, VoiceOverPlaywright } from '@guidepup/playwright';
import type { Keys, ScreenReaderDriver, Vocabulary } from './driver.ts';

/**
 * The half of a driver a real screen reader supplies: the commands.
 *
 * `./driver.ts` is the seam every transcript expectation is written
 * against, and it takes no position on which reader is speaking. The virtual
 * lane fills it with a reader written in JavaScript that reads a container; this
 * fills it with NVDA or VoiceOver reading a served page through Playwright. The
 * expectations do not change, which is the whole point of the seam.
 */
export type RealReader = NVDAPlaywright | VoiceOverPlaywright;

export type RealDriverSpec = {
	readonly name: string;
	readonly vocabulary: Vocabulary;
	readonly keys: Keys;
	/** Split one spoken phrase into the separate facts this reader announced. */
	segments: (phrase: string) => string[];
};

/**
 * Wrap a started reader in the shared driver shape.
 *
 * `start` and `stop` are deliberately inert: the @guidepup/playwright fixture
 * owns the reader's lifetime, and a suite that started or stopped it itself
 * would fight the fixture. Everything else forwards to the real reader.
 */
export function realDriver(reader: RealReader, spec: RealDriverSpec): ScreenReaderDriver {
	return {
		name: spec.name,
		vocabulary: spec.vocabulary,
		keys: spec.keys,
		segments: spec.segments,
		start: async () => {},
		stop: async () => {},
		next: () => reader.next(),
		previous: () => reader.previous(),
		press: (key) => reader.press(key),
		async reannounce() {
			// Neither reader has a "read the current item again" command that is
			// guaranteed to re-read from the live DOM, so this steps off the item
			// and back onto it - the same move the virtual driver makes.
			await reader.previous();
			await reader.next();
			return reader.lastSpokenPhrase();
		},
		// Nothing to drain over this seam: NVDA and VoiceOver follow the focus
		// themselves and speak it in their own process, and guidepup's
		// `lastSpokenPhrase()` reads the speech that came out. The virtual lane
		// needs a wait here because its reader announces from a listener inside the
		// page, one task-queue turn behind the gesture.
		settleOnFocus: () => reader.lastSpokenPhrase(),
		lastSpokenPhrase: () => reader.lastSpokenPhrase(),
		// The reader hands back its own log array, which keeps growing under the
		// caller's feet; a copy is what a test can hold on to.
		spokenPhraseLog: async () => [...(await reader.spokenPhraseLog())],
		clearSpokenPhraseLog: () => reader.clearSpokenPhraseLog(),
	};
}

/**
 * Both readers announce a run of facts about one item in a single phrase and
 * separate those facts with commas or line breaks. Splitting on anything looser
 * - spaces, say - would let "not checked" satisfy an assertion that asked for
 * "checked", which is the one failure mode a transcript suite must never have.
 */
export function commaSegments(phrase: string): string[] {
	return phrase
		.split(/[,\n]/)
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0);
}
