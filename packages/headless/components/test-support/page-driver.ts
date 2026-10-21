import type { NVDAPlaywright, VoiceOverPlaywright } from '@guidepup/playwright';
import { test, type Page } from '@playwright/test';
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

/** The element the page focused, as a reader's settling step sees it. */
export type FocusedElement = {
	/** Its accessible name as the browser computed it, or ''. */
	readonly name: string;
	/** Put the page's focus back on it, if the reader moved the focus away. */
	refocus(): Promise<void>;
};

export type RealDriverSpec<R extends RealReader = RealReader> = {
	readonly name: string;
	readonly vocabulary: Vocabulary;
	readonly keys: Keys;
	/** Split one spoken phrase into the separate facts this reader announced. */
	segments: (phrase: string) => string[];
	/** Bring the reading cursor to the element the page focused. */
	cursorToFocus?: (reader: R, focused: FocusedElement) => Promise<void>;
	/** Give the reader its own keys back before its reading cursor moves, if a focus move may have taken them. */
	keysToReader?: (reader: R) => Promise<void>;
	/** Run after every cursor move, for a reader whose move can come back without the phrase it spoke. */
	afterSilentMove?: (reader: R) => Promise<void>;
	/** Deliver a key for the focused element through the page rather than as a system keystroke. */
	keysThroughPage?: boolean;
	/** Say the focused element again, for a reader whose next-item keys would reach a focused widget instead. */
	reannounceFocus?: (reader: R) => Promise<void>;
	/** Undo the reader's own spelling-out of symbols, so a phrase can be compared with the name it read. */
	spoken?: (phrase: string) => string;
};

async function focusedAccessibleName(page: Page): Promise<string> {
	const cdp = await page.context().newCDPSession(page);
	try {
		const { result } = await cdp.send('Runtime.evaluate', {
			expression: 'document.activeElement',
		});
		if (!result.objectId) return '';
		const { nodes } = await cdp.send('Accessibility.getPartialAXTree', {
			objectId: result.objectId,
			fetchRelatives: false,
		});
		return String(nodes[0]?.name?.value ?? '');
	} finally {
		await cdp.detach();
	}
}

function recordPageKeys() {
	const store = globalThis as { __readerKeys?: string[] };
	if (store.__readerKeys) return;
	store.__readerKeys = [];
	addEventListener(
		'keydown',
		(event) => {
			const target = event.target as Element | null;
			const label =
				target?.getAttribute('aria-label') ?? target?.textContent?.trim().slice(0, 24);
			store.__readerKeys?.push(
				`${event.key} on ${target?.tagName.toLowerCase()} "${label ?? ''}"`,
			);
		},
		{ capture: true },
	);
}

// A walk that would outlast the test fails here with its own message, not as the fixture's "not running" mid-teardown.
const WALK_HEADROOM_MS = 45_000;

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
	page?: Page,
): ScreenReaderDriver {
	// Printed as it is heard: a walk cut short by the test timeout loses the transcript its own error would carry.
	const heard = async (phrase: Promise<string>) => {
		const raw = await phrase;
		console.log(`${spec.name} said: ${JSON.stringify(raw)}`);
		return spec.spoken ? spec.spoken(raw) : raw;
	};
	const pageHasFocus = async () =>
		page !== undefined &&
		(await page.evaluate(
			() => document.activeElement !== null && document.activeElement !== document.body,
		));
	const timeout = test.info().timeout;
	const deadline = timeout > 0 ? Date.now() + timeout - WALK_HEADROOM_MS : Infinity;
	// Whether a focus move may have switched the reader to handing its keys to the page.
	let keysMayBeWithPage = false;
	// Whether the reader was last placed by the page's focus rather than walked. A walked reader's item is not the
	// focused element under NVDA's browse mode, so a key then belongs to the reader, which acts on its own item.
	let placedByFocus = false;
	const keysBackToReader = async () => {
		if (!keysMayBeWithPage || !spec.keysToReader) return;
		await spec.keysToReader(reader);
		keysMayBeWithPage = false;
	};
	return {
		name: spec.name,
		vocabulary: spec.vocabulary,
		keys: spec.keys,
		segments: spec.segments,
		start: async () => {},
		stop: async () => {},
		async next() {
			if (Date.now() > deadline) {
				throw new Error(
					`${spec.name} was still walking with ${WALK_HEADROOM_MS / 1000} s of the test's ${timeout / 1000} s left; the phrases it said are printed above.`,
				);
			}
			await keysBackToReader();
			placedByFocus = false;
			await reader.next();
			await spec.afterSilentMove?.(reader);
		},
		async previous() {
			await keysBackToReader();
			placedByFocus = false;
			await reader.previous();
			await spec.afterSilentMove?.(reader);
		},
		async press(key) {
			await page?.evaluate(recordPageKeys);
			if (spec.keysThroughPage && placedByFocus && page && (await pageHasFocus())) {
				await page.keyboard.press(key);
			} else {
				await reader.press(key);
			}
			// Printed with the phrases: a key the reader kept and a key the widget ignored fail the same assertion.
			if (page) {
				const seen = await page.evaluate(() => {
					const keys = (globalThis as { __readerKeys?: string[] }).__readerKeys ?? [];
					return keys.splice(0);
				});
				console.log(`${spec.name} pressed ${key}; the page saw ${JSON.stringify(seen)}`);
			}
		},
		async reannounce() {
			// A reader placed by focus reads the focused element again: a key may have moved the focus since.
			if (placedByFocus && (await pageHasFocus())) {
				if (spec.reannounceFocus) {
					await spec.reannounceFocus(reader);
					return heard(reader.lastSpokenPhrase());
				}
				if (spec.cursorToFocus) return this.settleOnFocus();
			}
			// Neither reader has a "read the current item again" command that is
			// guaranteed to re-read from the live DOM, so this steps off the item
			// and back onto it - the same move the virtual driver makes.
			await keysBackToReader();
			await reader.previous();
			await reader.next();
			return heard(reader.lastSpokenPhrase());
		},
		async settleOnFocus() {
			keysMayBeWithPage = true;
			placedByFocus = true;
			if (spec.cursorToFocus && page) {
				const focused = await page.evaluateHandle(() => document.activeElement);
				try {
					await spec.cursorToFocus(reader, {
						name: await focusedAccessibleName(page),
						refocus: () =>
							focused.evaluate((element) => (element as HTMLElement | null)?.focus()),
					});
				} finally {
					await focused.dispose();
				}
			}
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
 * Bring VoiceOver into the web content and, heading by heading, onto the gallery section the URL fragment names.
 * `navigateToWebContent()` starts at the top whatever the fragment says, and a walk from there outlasts a test.
 */
export function voiceOverToAnchoredSection(voiceOver: VoiceOverPlaywright, page: Page) {
	return toAnchoredSection(page, {
		name: 'VoiceOver',
		enter: () => voiceOver.navigateToWebContent(),
		nextHeading: () => voiceOver.perform(voiceOver.keyboardCommands.findNextHeading),
		lastSpokenPhrase: () => voiceOver.lastSpokenPhrase(),
		reached: (phrase, heading) => phrase === `heading level 2 ${heading}`,
	});
}

/** The same move for NVDA, whose browse mode jumps heading to heading on H. */
export function nvdaToAnchoredSection(nvda: NVDAPlaywright, page: Page) {
	return toAnchoredSection(page, {
		name: 'NVDA',
		enter: () => nvda.navigateToWebContent(),
		nextHeading: () => nvda.perform(nvda.keyboardCommands.moveToNextHeading),
		lastSpokenPhrase: () => nvda.lastSpokenPhrase(),
		// The H jump says "Checkbox, heading, level 2"; leaving a grouping on the way prefixes "out of grouping, ".
		reached: (phrase, heading) =>
			phrase === `${heading}, heading, level 2` ||
			phrase.endsWith(`, ${heading}, heading, level 2`),
	});
}

async function toAnchoredSection(
	page: Page,
	reader: {
		readonly name: string;
		enter(): Promise<void>;
		nextHeading(): Promise<void>;
		lastSpokenPhrase(): Promise<string>;
		reached(phrase: string, heading: string): boolean;
	},
): Promise<void> {
	await reader.enter();
	const heading = await page.evaluate(() => {
		const section = document.getElementById(decodeURIComponent(location.hash.slice(1)));
		return section?.querySelector(':scope > h2')?.textContent?.trim() ?? '';
	});
	if (heading === '') {
		throw new Error(`${page.url()} names no gallery section with a heading to start from.`);
	}
	const headingCount = await page.locator('h1, h2, h3, h4, h5, h6').count();
	const seen: string[] = [];
	let phrase = await reader.lastSpokenPhrase();
	for (let step = 0; step <= headingCount; step++) {
		seen.push(phrase);
		if (reader.reached(phrase, heading)) return;
		await reader.nextHeading();
		phrase = await reader.lastSpokenPhrase();
	}
	throw new Error(
		`${reader.name} never reached the "${heading}" heading in ${headingCount} heading steps.\n` +
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
 * VoiceOver runs name, state and role together with spaces ("Checkbox Label unchecked checkbox"), so a fact is
 * any whole-word run: "checked" never matches inside "unchecked", and a run right after "not" is dropped.
 */
export function voiceOverSegments(phrase: string): string[] {
	// "heading level 2 Radio group" names a heading; the words of its text are not a role.
	const heading = /^(heading level \d+) (.+)$/.exec(phrase);
	if (heading) return ['heading', heading[1], heading[2]];
	// "end of Topics group" is the cursor leaving a container, not an announcement of it.
	if (phrase.startsWith('end of ')) return [phrase];
	return wordRuns(commaSegments(phrase), phrase);
}

/**
 * NVDA's browse mode reads a whole line, so one phrase can hold several items, and a role is often the tail
 * of a longer word ("toggle button"). A fact is a whole-word run inside one comma segment, as for VoiceOver.
 */
export function nvdaSegments(phrase: string): string[] {
	// "out of grouping, heading, level 2, Rating" leaves a container; it does not announce one.
	const segments = commaSegments(phrase).filter((segment) => !segment.startsWith('out of '));
	return wordRuns(segments, segments.join(', '));
}

/** NVDA speaks symbols as words ("README dot md", "80 percent"); this puts the page's own spelling back. */
export function nvdaSymbols(phrase: string): string {
	return phrase.replace(/(\S) dot (?=\S)/g, '$1.').replace(/(\d) percent\b ?/g, '$1%');
}

function wordRuns(segments: string[], phrase: string): string[] {
	const runs = new Set<string>();
	const addRuns = (words: string[]) => {
		for (let start = 0; start < words.length; start++) {
			if (start > 0 && words[start - 1].toLowerCase() === 'not') continue;
			for (let end = start + 1; end <= words.length; end++) {
				// A run that ends where a comma separated the next fact: "2026," in "…August 19, 2026, toggle button".
				runs.add(words.slice(start, end).join(' ').replace(/,$/, ''));
			}
		}
	};
	for (const segment of segments) {
		runs.add(segment);
		addRuns(segment.split(/\s+/));
	}
	// Words with their commas kept, so a name that holds commas ("Monday, August 3, 2026") is still one run.
	addRuns(phrase.trim().split(/\s+/));
	return [...runs];
}
