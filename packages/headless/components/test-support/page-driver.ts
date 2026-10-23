import type { NVDAPlaywright, VoiceOverPlaywright } from '@guidepup/playwright';
import type { Page } from '@playwright/test';
import type { Keys, RoleStates, ScreenReaderDriver, Vocabulary } from './driver.ts';

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
	readonly roleStates?: RoleStates;
	readonly keys: Keys;
	/** Split one spoken phrase into the separate facts this reader announced. */
	segments: (phrase: string) => string[];
	/** Move the page's keyboard focus to the reader's cursor, for a reader whose cursor walks apart from it. */
	focusCursor?: (reader: RealReader) => Promise<void>;
	/** Make the reader speak the focused element, for a reader whose own focus-following speech is not captured. */
	speakFocus?: (reader: RealReader) => Promise<void>;
};

/**
 * Wrap a started reader in the shared driver shape.
 *
 * `start` and `stop` are deliberately inert: the @guidepup/playwright fixture
 * owns the reader's lifetime, and a suite that started or stopped it itself
 * would fight the fixture. Everything else forwards to the real reader.
 */
export function realDriver(reader: RealReader, spec: RealDriverSpec): ScreenReaderDriver {
	// A walk moves the reader's cursor and leaves keyboard focus behind; a key goes where the person is reading.
	let cursorAhead = false;
	return {
		name: spec.name,
		vocabulary: spec.vocabulary,
		...(spec.roleStates ? { roleStates: spec.roleStates } : {}),
		keys: spec.keys,
		segments: spec.segments,
		start: async () => {},
		stop: async () => {},
		async next() {
			await reader.next();
			cursorAhead = true;
		},
		async previous() {
			await reader.previous();
			cursorAhead = true;
		},
		async press(key) {
			if (cursorAhead) await spec.focusCursor?.(reader);
			cursorAhead = false;
			await reader.press(key);
		},
		async reannounce() {
			// Neither reader has a "read the current item again" command that is
			// guaranteed to re-read from the live DOM, so this steps off the item
			// and back onto it - the same move the virtual driver makes.
			await reader.previous();
			await reader.next();
			return reader.lastSpokenPhrase();
		},
		async settleOnFocus() {
			cursorAhead = false;
			await spec.speakFocus?.(reader);
			return reader.lastSpokenPhrase();
		},
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

/**
 * VoiceOver speaks a name, its states and its role as one run of words with no
 * separator ("Checkbox Label unchecked checkbox"), and a name can hold commas of
 * its own ("Monday, August 3, 2026 toggle button"), so every contiguous run of
 * words is a candidate fact. Its negative states are single words ("unchecked",
 * "collapsed", "dimmed"); a run that starts right after "not" is still dropped,
 * so "not checked" can never satisfy "checked".
 */
export function wordRunSegments(phrase: string): string[] {
	const words = phrase.split(/\s+/).filter((word) => word.length > 0);
	const runs = new Set<string>();
	for (let start = 0; start < words.length; start++) {
		if (start > 0 && words[start - 1]!.replace(/,$/, '').toLowerCase() === 'not') continue;
		for (let end = start + 1; end <= words.length; end++)
			runs.add(words.slice(start, end).join(' ').replace(/,$/, ''));
	}
	return [...runs];
}

/**
 * Put the reading cursor on the section the page's URL fragment names.
 *
 * Entering web content starts the cursor at the top of the document, and the
 * gallery holds every family; VoiceOver's cursor follows keyboard focus, so
 * focusing the section starts the walk where the family is.
 */
export async function startAtFragment(page: Page): Promise<void> {
	const id = decodeURIComponent(new URL(page.url()).hash.slice(1));
	if (!id) throw new Error(`${page.url()} names no section to start reading at.`);
	await page.locator(`[id="${id}"]`).evaluate((section: HTMLElement) => {
		section.tabIndex = -1;
		section.focus();
	});
}
