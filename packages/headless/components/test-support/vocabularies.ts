import type { Keys, Vocabulary } from './driver.ts';
import { commaSegments, type RealDriverSpec } from './page-driver.ts';

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
};

// The authoring practices give a checkbox one activation key. Both readers pass
// a key name straight to the focused item, so the name is the browser's.
const keys: Keys = { space: 'Space', enter: 'Enter' };

export const nvdaSpec: RealDriverSpec = {
	name: 'NVDA',
	vocabulary: nvdaVocabulary,
	keys,
	segments: commaSegments,
};

export const voiceOverSpec: RealDriverSpec = {
	name: 'VoiceOver',
	vocabulary: voiceOverVocabulary,
	keys,
	segments: commaSegments,
};
