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

/**
 * What one reader calls the facts an announcement has to convey.
 *
 * One flat table, because `Conveys` names a role and a list of states out of the
 * same key space. A family adds the slots it needs and every driver fills them;
 * a slot no driver can fill honestly does not belong here — see the negative
 * proofs in the suites, which assert a fact is *absent* rather than inventing a
 * word for its absence.
 *
 * One reader having no word for a fact the others do speak is the exception, and
 * it is written as the empty string: `missingFacts` then skips that fact for that
 * reader rather than failing it against a word nobody has observed.
 */
export type Vocabulary = {
	readonly checkbox: string;
	/** What a reader calls the element a set of checkboxes is presented in. */
	readonly group: string;
	readonly checked: string;
	readonly notChecked: string;
	readonly partiallyChecked: string;
	readonly disabled: string;
	readonly invalid: string;
	/** A two-state control that is on or off rather than ticked - `role="switch"`. */
	readonly switch: string;
	/** The element a set of radios is presented in - `role="radiogroup"`. */
	readonly radiogroup: string;
	readonly radio: string;
	readonly tablist: string;
	readonly tab: string;
	readonly tabpanel: string;
	/** The trigger that shows a set of choices - `role="combobox"`. */
	readonly combobox: string;
	/** The popup a combobox shows its choices in - `role="listbox"`. */
	readonly listbox: string;
	/** One choice inside a listbox - `role="option"`. */
	readonly option: string;
	readonly button: string;
	readonly progressbar: string;
	/** A single- or multi-line text entry field. */
	readonly textbox: string;
	/** The landmark a set of navigation controls is presented in - `<nav>`. */
	readonly navigation: string;
	readonly link: string;
	/** A named container a person can jump to - `role="region"`. */
	readonly region: string;
	/** A single graphic that is one object in the tree - `role="img"`. */
	readonly image: string;
	/** A window laid over the page that carries its own name - `role="dialog"`. */
	readonly dialog: string;
	/**
	 * A rotating set of slides - `aria-roledescription="carousel"` on the root.
	 * ARIA defines `aria-roledescription` as replacing the role word a reader
	 * speaks, so this slot holds the announced word rather than `group`.
	 */
	readonly carousel: string;
	/** One panel of a carousel - `aria-roledescription="slide"` on an item. */
	readonly slide: string;
	/** The state a chosen tab is in - `aria-selected="true"`. */
	readonly selected: string;
	/** The page you are on inside a set of page controls - `aria-current="page"`. */
	readonly currentPage: string;
	/** A disclosure trigger whose panel is showing - `aria-expanded="true"`. */
	readonly expanded: string;
	/** A disclosure trigger whose panel is hidden - `aria-expanded="false"`. */
	readonly notExpanded: string;
};

/** The key names an operation is written in, per reader. */
export type Keys = {
	/** The one key that toggles a checkbox, per the WAI-ARIA authoring practices. */
	readonly space: string;
	readonly enter: string;
	/** The two keys a radio group and a tab list move through their set with. */
	readonly arrowDown: string;
	readonly arrowRight: string;
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
	/**
	 * Say the item under the cursor again, without moving on.
	 *
	 * Readers have no such command, so every driver fakes it by stepping off the
	 * item and back onto it. The round trip only returns to where it started
	 * while nothing else is moving the cursor, so it is for a gesture that
	 * changed an attribute in place - never for one that moved a roving focus,
	 * which the reader follows on its own and `settleOnFocus()` reads.
	 */
	reannounce(): Promise<string>;
	/**
	 * Wait for the announcement the page's own focus move set in motion, and hand
	 * it back.
	 *
	 * A gesture that moves a roving focus makes a reader speak by itself - it is
	 * following the focus, not being asked. That announcement can still be in
	 * flight when `press()` returns, so this waits for the reader's reading
	 * position to agree with what the page has focused and then answers with what
	 * it said there.
	 *
	 * It waits for the reader, never for the page: a caller asserts the gesture's
	 * own DOM outcome first (the focus is where the gesture had to put it), or
	 * this will honestly answer with what the reader said about the item the
	 * gesture moved *off*.
	 */
	settleOnFocus(): Promise<string>;
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
	// An empty slot is a reader with no word for the fact, not a fact it omitted.
	const absent = (word: string) => word !== '' && !spoken.includes(word);
	if (conveys.role && absent(driver.vocabulary[conveys.role])) {
		missing.push(`role "${driver.vocabulary[conveys.role]}"`);
	}
	if (conveys.name !== undefined && !spoken.includes(conveys.name)) {
		missing.push(`name "${conveys.name}"`);
	}
	for (const state of conveys.state ?? []) {
		if (absent(driver.vocabulary[state])) {
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
