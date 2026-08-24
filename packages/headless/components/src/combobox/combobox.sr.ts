import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import { Basic } from './scenarios/basic.tsrx';
import { Inline } from './scenarios/inline.tsrx';
import { OpenList } from './scenarios/open-list.tsrx';
import { Prefilled } from './scenarios/prefilled.tsrx';
import { SignupForm } from './scenarios/signup-form.tsrx';
import { UnavailableOptions } from './scenarios/unavailable-options.tsrx';
import { WithError } from './scenarios/with-error.tsrx';

// What a screen reader says about the combobox family, asserted the way the
// w3c/aria-at plans assert it: each step names the facts the announcement has to
// convey - role, accessible name, state - and never a product's wording. `sr` is
// the only line that picks a reader, so the same expectations run against NVDA
// and VoiceOver once those drivers land.
//
// The gap this file exists to make visible: DOM focus never leaves the field, so
// the ONLY channel that could tell a reader which option is highlighted is
// `aria-activedescendant`, and the compiler refuses it. The last row here is
// that hole, pinned rather than left silent.
const sr = virtualDriver;

// The words this family needs that `test-support/driver.ts`'s shared Vocabulary
// does not carry. They live here rather than in the shared table for the reason
// select's file gives: promoting them changes a table every other family's
// driver reads, which is a change of its own rather than a combobox concern.
const WORDS: Record<string, Record<string, string>> = {
	// measured: this reader's own output for our markup
	virtual: {
		combobox: 'combobox',
		listbox: 'listbox',
		option: 'option',
		selected: 'selected',
		notSelected: 'not selected',
		expanded: 'expanded',
		collapsed: 'not expanded',
		disabled: 'disabled',
		invalid: 'invalid',
	},
	// unverified against our markup; aria-at's combobox plan says "combo box"
	NVDA: {
		combobox: 'combo box',
		listbox: 'list box',
		option: '',
		selected: 'selected',
		notSelected: 'not selected',
		expanded: 'expanded',
		collapsed: 'collapsed',
		disabled: 'unavailable',
		invalid: 'invalid entry',
	},
	// unverified against our markup
	VoiceOver: {
		combobox: 'combo box',
		listbox: 'list box',
		option: '',
		selected: 'selected',
		notSelected: 'not selected',
		expanded: 'expanded',
		collapsed: 'collapsed',
		disabled: 'dimmed',
		invalid: 'invalid data',
	},
};

const say = WORDS[sr.name] ?? WORDS.virtual;

// One scenario per test: two comboboxes alive in one document give two listboxes
// the same minted ids, and every IDREF after the first resolves to the wrong one.
async function open(component: Parameters<typeof render>[0]) {
	const { container } = await render(component);
	await sr.start(container as unknown as HTMLElement);
}

afterEach(async () => {
	await sr.stop().catch(() => {});
});

function missing(phrase: string, facts: readonly string[]): string[] {
	const spoken = sr.segments(phrase);
	return facts.filter((fact) => fact !== '' && !spoken.includes(fact));
}

function expectConveys(phrase: string, facts: readonly string[]) {
	expect(missing(phrase, facts), `${sr.name} announced "${phrase}"`).toEqual([]);
}

// Move the reading cursor forward until an announcement conveys everything asked
// for, and.
 return it. Throws with the transcript so far when it does not, because
// a walk that never arrives is the same defect as a wrong phrase.
async function readFor(facts: readonly string[], limit = 40): Promise<string> {
	const seen: string[] = [];
	let phrase = await sr.lastSpokenPhrase();
	for (let step = 0; step <= limit; step++) {
		seen.push(phrase);
		if (missing(phrase, facts).length === 0) return phrase;
		await sr.next();
		phrase = await sr.lastSpokenPhrase();
	}
	throw new Error(
		`${sr.name} never announced ${JSON.stringify(facts)} in ${limit} steps.\n` +
			`Transcript: ${JSON.stringify(seen, null, 1)}`,
	);
}

// Entering the field. The INPUT is the combobox here, which is the difference
// from select: there a button carries the role, and the row that proves it is in
// that family's own file.
test('entering the combobox conveys the combobox role and the field name', async () => {
	await open(Basic);
	expectConveys(await readFor([say.combobox]), [say.combobox, 'Favorite Fruit']);
});

// A combobox whose list is not showing says so.
test('a combobox not showing its list conveys that it is collapsed', async () => {
	await open(Basic);
	expectConveys(await readFor([say.combobox]), [say.combobox, say.collapsed]);
});

// The list, once it is showing. It is named by the same label the field is,
// which is what makes it findable on its own.
test('a combobox showing its list conveys expanded and a named listbox', async () => {
	await open(OpenList);
	expectConveys(await readFor([say.combobox]), [say.combobox, say.expanded]);
	expectConveys(await readFor([say.listbox]), [say.listbox, 'Favorite Fruit']);
});

// The chosen option is conveyed as selected and the others are not.
test('the chosen option is the only one conveyed as selected', async () => {
	await open(Prefilled);
	expectConveys(await readFor(['Apple']), ['Apple', say.notSelected]);
	expectConveys(await readFor(['Banana']), ['Banana', say.selected]);
});

// An option nobody may choose has to say so, and the combobox it sits in stays
// usable.
test('an option nobody may choose conveys that it is disabled', async () => {
	await open(UnavailableOptions);
	expectConveys(await readFor(['Premium']), ['Premium', say.disabled]);
});

// A whole disabled combobox. The field is a native disabled input, so the reader
// conveys it on the combobox itself.
test('a combobox nobody may touch conveys disabled on the combobox', async () => {
	await open(UnavailableOptions);
	expectConveys(await readFor([say.combobox, 'Archived plan']), [
		say.combobox,
		'Archived plan',
		say.disabled,
	]);
});

// An inline list is part of the page, and it is still a named listbox.
test('an inline combobox conveys a named listbox', async () => {
	await open(Inline);
	expectConveys(await readFor([say.listbox]), [say.listbox, 'Favorite Fruit']);
});

// NOT a framework gap, and not fixable inside this family - recorded as a row so
// nobody spends a second afternoon on it. An inline combobox writes neither
// `aria-expanded` nor `aria-haspopup` (the browser suite proves both attributes
// are absent), and a reader STILL announces "has popup listbox, not expanded".
// That is ARIA's own doing: `role="combobox"` carries an implicit
// `aria-expanded="false"` and an implicit popup, so the state is computed from
// the role rather than from anything authored. The only way out is to stop being
// a combobox, which the authoring practices' own pattern forbids. Qwik UI's
// inline mode has the identical announcement. Deterministic, so.
 test.fails.
test.fails('an inline combobox claims no expanded state', async () => {
	await open(Inline);
	const entering = await readFor([say.combobox]);
	expect(missing(entering, [say.collapsed]), `${sr.name} announced "${entering}"`).toEqual([
		say.collapsed,
	]);
});

// The message part is what a reader is told about, and the field says it is in an
// invalid state.
test('an invalid combobox conveys its message', async () => {
	await open(WithError);
	expectConveys(await readFor(['Pick a fruit that exists.']), ['Pick a fruit that exists.']);
});

// The hidden native control. A bare `.
<select>` carries the combobox role
// natively, so a form-participating combobox that failed to hide it would put
// the same choice in the tree twice. `aria-hidden` plus `tabindex="-1"` is what
// makes the correct expected result silence, and this row proves it by counting:
// one combobox is announced on a page that holds two combobox-shaped controls.
test('the hidden native control is never announced beside the real combobox', async () => {
	await open(SignupForm);
	const log: string[] = [];
	for (let step = 0; step < 60; step++) {
		log.push(await sr.lastSpokenPhrase());
		await sr.next();
	}
	const spoken = log.filter((phrase) => sr.segments(phrase)[0] === say.combobox);
	expect(spoken.length).toBeGreaterThan(0);
	expect(new Set(spoken).size).toBe(1);
});

// PENDING CAPABILITY - aria-activedescendant, and the accessibility hole this
// family ships with. Arrowing moves the highlight; DOM focus stays in the field
// on purpose, so nothing the reader watches has changed and it says nothing at
// all. `aria-activedescendant` is the attribute that would report it, and the
// compiler leaves it out of IDREF_ATTRIBUTES deliberately (see
// packages/compiler/src/passes/semantic-graph/idref-attributes.ts). Until it
// lands, the highlight is visible and inaudible - and this row is what says so
// out loud rather than the file staying silent about it. Deterministic, so.
 test.fails.
test.fails('arrowing announces the option the highlight moved to', async () => {
	await open(OpenList);
	await readFor([say.combobox]);
	const apple = document.querySelector('[data-testid="apple"]');
	expect(apple, 'the scenario names its first option').not.toBeNull();

	await sr.press(sr.keys.arrowDown);
	await expect.poll(() => apple?.getAttribute('ui-highlighted')).toBe('');
	expectConveys(await sr.settleOnFocus(), ['Apple', say.option]);
});
