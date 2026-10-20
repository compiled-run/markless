import type { NVDAPlaywright, VoiceOverPlaywright } from '@guidepup/playwright';
import type { Page } from '@playwright/test';
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

export type RealDriverSpec<R extends RealReader = RealReader> = {
	readonly name: string;
	readonly vocabulary: Vocabulary;
	readonly keys: Keys;
	/** Split one spoken phrase into the separate facts this reader announced. */
	segments: (phrase: string) => string[];
	/** Bring the reading cursor to the element the page focused, for a reader that does not follow focus on its own. */
	cursorToFocus?: (reader: R) => Promise<void>;
	/** Bring the page's focus to the item the reading cursor is on, so a key lands on the item the reader just read. */
	focusToCursor?: (reader: R) => Promise<void>;
};

/**
 * Wrap a started reader in the shared driver shape.
 *
 * `start` and `stop` are deliberately inert: the @guidepup/playwright fixture
 * owns the reader's lifetime, and a suite that started or stopped it itself
 * would fight the fixture. Everything else forwards to the real reader.
 */
export function realDriver<R extends RealReader>(
	reader: R,
	spec: RealDriverSpec<R>,
): ScreenReaderDriver {
	// Printed as it is heard: a walk cut short by the test timeout loses the transcript its own error would carry.
	const heard = async (phrase: Promise<string>) => {
		const spoken = await phrase;
		console.log(`${spec.name} said: ${JSON.stringify(spoken)}`);
		return spoken;
	};
	return {
		name: spec.name,
		vocabulary: spec.vocabulary,
		keys: spec.keys,
		segments: spec.segments,
		start: async () => {},
		stop: async () => {},
		next: () => reader.next(),
		previous: () => reader.previous(),
		async press(key) {
			await spec.focusToCursor?.(reader);
			await reader.press(key);
		},
		async reannounce() {
			// Neither reader has a "read the current item again" command that is
			// guaranteed to re-read from the live DOM, so this steps off the item
			// and back onto it - the same move the virtual driver makes.
			await reader.previous();
			await reader.next();
			return heard(reader.lastSpokenPhrase());
		},
		async settleOnFocus() {
			await spec.cursorToFocus?.(reader);
			return heard(reader.lastSpokenPhrase());
		},
		lastSpokenPhrase: () => heard(reader.lastSpokenPhrase()),
		// The reader hands back its own log array, which keeps growing under the
		// caller's feet; a copy is what a test can hold on to.
		spokenPhraseLog: async () => [...(await reader.spokenPhraseLog())],
		clearSpokenPhraseLog: () => reader.clearSpokenPhraseLog(),
	};
}

/**
 * Bring VoiceOver into the web content and onto the heading of the gallery
 * section the page's URL fragment names.
 *
 * `navigateToWebContent()` leaves VoiceOver at the top of the document whatever
 * the fragment says, and the gallery holds every family, so a walk from the top
 * to a late section is hundreds of VoiceOver steps, longer than a test may run.
 * This moves the way a VoiceOver user would, heading by heading.
 */
export async function voiceOverToAnchoredSection(
	voiceOver: VoiceOverPlaywright,
	page: Page,
): Promise<void> {
	await voiceOver.navigateToWebContent();
	const heading = await page.evaluate(() => {
		const section = document.getElementById(decodeURIComponent(location.hash.slice(1)));
		return section?.querySelector(':scope > h2')?.textContent?.trim() ?? '';
	});
	if (heading === '') {
		throw new Error(`${page.url()} names no gallery section with a heading to start from.`);
	}
	const target = `heading level 2 ${heading}`;
	const headingCount = await page.locator('h1, h2, h3, h4, h5, h6').count();
	const seen: string[] = [];
	let phrase = await voiceOver.lastSpokenPhrase();
	for (let step = 0; step <= headingCount; step++) {
		seen.push(phrase);
		if (phrase === target) return;
		await voiceOver.perform(voiceOver.keyboardCommands.findNextHeading);
		phrase = await voiceOver.lastSpokenPhrase();
	}
	throw new Error(
		`VoiceOver never reached "${target}" in ${headingCount} heading steps.\n` +
			`Transcript: ${JSON.stringify(seen, null, 1)}`,
	);
}

/**
 * NVDA announces a run of facts about one item in a single phrase and
 * separates those facts with commas or line breaks. Splitting on anything looser
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
 * VoiceOver's captured phrase runs name, state and role together with only
 * spaces between them ("Checkbox Label unchecked checkbox"), so a fact is any
 * whole-word run inside one comma segment. Whole words keep "checked" out of
 * "unchecked", and a run directly after "not" is dropped so "not selected"
 * never conveys "selected".
 */
export function voiceOverSegments(phrase: string): string[] {
	// "heading level 2 Radio group" names a heading; the words of its text are not a role.
	const heading = /^(heading level \d+) (.+)$/.exec(phrase);
	if (heading) return ['heading', heading[1], heading[2]];
	// "end of Topics group" is the cursor leaving a container, not an announcement of it.
	if (phrase.startsWith('end of ')) return [phrase];
	const runs = new Set<string>();
	const addRuns = (words: string[]) => {
		for (let start = 0; start < words.length; start++) {
			if (start > 0 && words[start - 1].toLowerCase() === 'not') continue;
			for (let end = start + 1; end <= words.length; end++) {
				runs.add(words.slice(start, end).join(' '));
			}
		}
	};
	for (const segment of commaSegments(phrase)) {
		runs.add(segment);
		addRuns(segment.split(/\s+/));
	}
	// Words with their commas kept, so a name that holds commas ("Monday, August 3, 2026") is still one run.
	addRuns(phrase.trim().split(/\s+/));
	return [...runs];
}
