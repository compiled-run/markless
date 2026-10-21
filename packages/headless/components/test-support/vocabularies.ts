import type { Keys, Vocabulary } from './driver.ts';
import type { VoiceOverPlaywright } from '@guidepup/playwright';
import { commaSegments, voiceOverSegments, type RealDriverSpec } from './page-driver.ts';

/**
 * What NVDA and VoiceOver call the facts a checkbox announcement has to convey.
 *
 * Three of these words are recorded in `./README.md`, taken from the
 * w3c/aria-at plans: the role, "not checked", and the indeterminate state.
 * The rest are the readers' documented wording and have never been observed
 * against our markup, because neither reader can be driven on a developer
 * machine without an assistive technology install and, on macOS, a permission
 * grant.
 *
 * `./README.md` says never to invent an expected phrase. The rule this file
 * follows instead: every slot is filled so a driver is complete, and
 * `../src/checkbox/checkbox-transcript.ts` asserts only on the slots marked
 * verified below.
 * The first CI run that reaches a real reader prints the actual transcript on
 * failure, and whoever reads it corrects these words and widens the suite.
 */

/** Which vocabulary slots a suite may assert on today, and why. */
export const SOURCED_FACTS = ['checkbox', 'notChecked', 'checked'] as const;

export const nvdaVocabulary: Vocabulary = {
	// sourced: ./README.md reader table
	checkbox: 'check box',
	// sourced: ./README.md reader table
	notChecked: 'not checked',
	// sourced: ./README.md reader table
	partiallyChecked: 'half checked',
	// unverified against our markup
	checked: 'checked',
	// unverified against our markup
	group: 'grouping',
	// unverified against our markup
	disabled: 'unavailable',
	// unverified against our markup
	invalid: 'invalid entry',
	// unverified against our markup
	switch: 'switch',
	// unverified against our markup; the radio-group research note records
	// aria-at's own transcript for this role as "group"
	radiogroup: 'grouping',
	// unverified against our markup; aria-at's radiogroup plan says "radio button"
	radio: 'radio button',
	// unverified against our markup
	radioChecked: 'checked',
	// unverified against our markup
	radioNotChecked: 'not checked',
	// unverified against our markup; aria-at's tabs plan says "tab list"
	tablist: 'tab list',
	// unverified against our markup
	tab: 'tab',
	// unverified against our markup; aria-at's tabs plan says "tab panel"
	tabpanel: 'tab panel',
	// unverified against our markup
	combobox: 'combo box',
	// unverified against our markup
	listbox: 'list box',
	// this reader speaks no role word for an option; it reads the choice's name
	option: '',
	// unverified against our markup
	button: 'button',
	// unverified against our markup
	progressbar: 'progress bar',
	// unverified against our markup
	textbox: 'edit',
	// unverified against our markup
	navigation: 'navigation landmark',
	// unverified against our markup
	link: 'link',
	// unverified against our markup
	region: 'region',
	// unverified against our markup
	image: 'graphic',
	// unverified against our markup; aria-at's modal-dialog plan asserts this role
	// as "dialog" at priority 1
	dialog: 'dialog',
	// unverified against our markup; ARIA defines `aria-roledescription` as the
	// word a reader speaks in place of the role, so the author string is the
	// expected wording for every reader that honours the attribute
	carousel: 'carousel',
	// unverified against our markup; same `aria-roledescription` rule as above
	slide: 'slide',
	// unverified against our markup
	selected: 'selected',
	// unverified against our markup
	currentPage: 'current page',
	// unverified against our markup
	expanded: 'expanded',
	// unverified against our markup
	notExpanded: 'collapsed',
};

export const voiceOverVocabulary: Vocabulary = {
	// sourced: ./README.md reader table
	checkbox: 'checkbox',
	// sourced: ./README.md reader table
	notChecked: 'unchecked',
	// sourced: ./README.md reader table
	partiallyChecked: 'mixed',
	// unverified against our markup
	checked: 'checked',
	// unverified against our markup
	group: 'group',
	// unverified against our markup
	disabled: 'dimmed',
	// unverified against our markup
	invalid: 'invalid data',
	// unverified against our markup
	switch: 'switch',
	// unverified against our markup; the radio-group research note records
	// aria-at's own transcript for this role as "group"
	radiogroup: 'group',
	// unverified against our markup; aria-at's radiogroup plan says "radio button"
	radio: 'radio button',
	// observed on a macos-26 runner: "3 of 5 selected radio button, 3 of 5"
	radioChecked: 'selected',
	// observed on a macos-26 runner: "Monthly radio button, 1 of 3", no state word at all
	radioNotChecked: '',
	// unverified against our markup; aria-at's tabs plan says "tab list"
	tablist: 'tab list',
	// unverified against our markup
	tab: 'tab',
	// unverified against our markup; aria-at's tabs plan says "tab panel"
	tabpanel: 'tab panel',
	// unverified against our markup
	combobox: 'combo box',
	// unverified against our markup
	listbox: 'list box',
	// this reader speaks no role word for an option; it reads the choice's name
	option: '',
	// unverified against our markup
	button: 'button',
	// unverified against our markup
	progressbar: 'progress indicator',
	// observed on a macos-26 runner: "Type your name required edit text"
	textbox: 'edit text',
	// unverified against our markup
	navigation: 'navigation',
	// unverified against our markup
	link: 'link',
	// unverified against our markup
	region: 'region',
	// unverified against our markup
	image: 'image',
	// unverified against our markup; aria-at's modal-dialog plan asserts this role
	// as "dialog" at priority 1
	dialog: 'dialog',
	// unverified against our markup; ARIA defines `aria-roledescription` as the
	// word a reader speaks in place of the role, so the author string is the
	// expected wording for every reader that honours the attribute
	carousel: 'carousel',
	// unverified against our markup; same `aria-roledescription` rule as above
	slide: 'slide',
	// unverified against our markup
	selected: 'selected',
	// unverified against our markup
	currentPage: 'current page',
	// unverified against our markup
	expanded: 'expanded',
	// unverified against our markup
	notExpanded: 'collapsed',
};

// The authoring practices give a checkbox one activation key, and a radio group
// and a tab list one movement key each. Both readers pass a key name straight to
// the focused item, so the names are the browser's.
const keys: Keys = {
	space: 'Space',
	enter: 'Enter',
	arrowDown: 'ArrowDown',
	arrowRight: 'ArrowRight',
};

export const nvdaSpec: RealDriverSpec = {
	name: 'NVDA',
	vocabulary: nvdaVocabulary,
	keys,
	segments: commaSegments,
};

// VoiceOver's cursor and the page's focus are two positions; settling joins them with VoiceOver's own command.
export const voiceOverSpec: RealDriverSpec<VoiceOverPlaywright> = {
	name: 'VoiceOver',
	vocabulary: voiceOverVocabulary,
	keys,
	segments: voiceOverSegments,
	async cursorToFocus(voiceOver, focusedName) {
		// VoiceOver learns of a focus change after the page makes it; until then it answers with the old
		// focus or the document itself, so it is asked again until it names the element the page focused.
		const arrived = (phrase: string) =>
			focusedName === ''
				? phrase !== '' && !phrase.endsWith(' web content')
				: phrase.includes(focusedName);
		const moveCursor = () =>
			voiceOver.perform(voiceOver.keyboardCommands.moveCursorToKeyboardFocus);
		const describeFocus = () =>
			voiceOver.perform(voiceOver.keyboardCommands.describeItemWithKeyboardFocus);
		// Asking moves nothing. Moving the cursor while VoiceOver still believes the old element has focus
		// would hand the page's focus back to that element, because its keyboard focus follows its cursor.
		for (let attempt = 0; attempt < 20; attempt++) {
			await describeFocus();
			if (arrived(await voiceOver.lastSpokenPhrase())) break;
		}
		if (!arrived(await voiceOver.lastSpokenPhrase())) return;
		await moveCursor();
		if (!arrived(await voiceOver.lastSpokenPhrase())) await describeFocus();
	},
};
