/**
 * The seam between a family's transcript expectations and whichever screen
 * reader is speaking.
 *
 * A suite written against this seam never names a product's wording. It says which
 * facts an announcement has to convey — role, accessible name, state — in the
 * style the w3c/aria-at test plans use, and the driver supplies both the
 * commands and that reader's own vocabulary for those facts. The same file can
 * then run against the virtual reader locally and against NVDA or VoiceOver in
 * CI, and later against a W3C AT Driver connection, without an edit.
 */

/** What one reader calls the facts a checkbox announcement has to convey. */
export type Vocabulary = {
	readonly checkbox: string;
	/** What a reader calls the element a set of checkboxes is presented in. */
	readonly group: string;
	readonly checked: string;
	readonly notChecked: string;
	readonly partiallyChecked: string;
	readonly disabled: string;
	readonly invalid: string;
};

/** The key names an operation is written in, per reader. */
export type Keys = {
	/** The one key that toggles a checkbox, per the WAI-ARIA authoring practices. */
	readonly space: string;
	readonly enter: string;
};

export type ScreenReaderDriver = {
	readonly name: string;
	readonly vocabulary: Vocabulary;
	readonly keys: Keys;
	/** Split one spoken phrase into the separate facts the reader announced. */
	segments(phrase: string): string[];
	start(container: HTMLElement): Promise<void>;
	stop(): Promise<void>;
	next(): Promise<void>;
	previous(): Promise<void>;
	press(key: string): Promise<void>;
	/** Say the item under the cursor again, without moving on. */
	reannounce(): Promise<string>;
	lastSpokenPhrase(): Promise<string>;
	spokenPhraseLog(): Promise<string[]>;
	clearSpokenPhraseLog(): Promise<void>;
};

/** The facts one announcement has to convey, in aria-at's assertion style. */
export type Conveys = {
	readonly role?: keyof Vocabulary;
	readonly name?: string;
	readonly state?: readonly (keyof Vocabulary)[];
};

/**
 * The reason an announcement did or did not carry a fact, as a line a failure
 * message can print. Returns an empty array when everything asked for is there.
 */
export function missingFacts(
	driver: ScreenReaderDriver,
	phrase: string,
	conveys: Conveys,
): string[] {
	const spoken = driver.segments(phrase);
	const missing: string[] = [];
	if (conveys.role && !spoken.includes(driver.vocabulary[conveys.role])) {
		missing.push(`role "${driver.vocabulary[conveys.role]}"`);
	}
	if (conveys.name !== undefined && !spoken.includes(conveys.name)) {
		missing.push(`name "${conveys.name}"`);
	}
	for (const state of conveys.state ?? []) {
		if (!spoken.includes(driver.vocabulary[state])) {
			missing.push(`state "${driver.vocabulary[state]}"`);
		}
	}
	return missing;
}

/**
 * Move the reading cursor forward until an announcement conveys everything
 * asked for, and return it. Throws with the transcript so far when it does not,
 * because a walk that never arrives is the same defect as a wrong phrase.
 */
export async function readUntil(
	driver: ScreenReaderDriver,
	conveys: Conveys,
	limit = 20,
): Promise<string> {
	const seen: string[] = [];
	let phrase = await driver.lastSpokenPhrase();
	for (let step = 0; step <= limit; step++) {
		seen.push(phrase);
		if (missingFacts(driver, phrase, conveys).length === 0) return phrase;
		await driver.next();
		phrase = await driver.lastSpokenPhrase();
	}
	throw new Error(
		`${driver.name} never announced ${JSON.stringify(conveys)} in ${limit} steps.\n` +
			`Transcript: ${JSON.stringify(seen, null, 1)}`,
	);
}
