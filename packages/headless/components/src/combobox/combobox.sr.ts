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

// Rows assert the facts an announcement must convey - role, name, state - never a reader product's wording.
const sr = virtualDriver;

// Words this family needs that the shared Vocabulary in test-support/driver.ts does not carry yet.
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
	// unverified against our markup
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

// One scenario per test: two live comboboxes mint the same listbox ids, so every IDREF after the first resolves to the wrong one.
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

// Walk forward until an announcement conveys everything asked for; a walk that never arrives is the same defect as a wrong phrase.
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

// The input carries the combobox role here, unlike select, where a button does.
test('entering the combobox conveys the combobox role and the field name', async () => {
	await open(Basic);
	expectConveys(await readFor([say.combobox]), [say.combobox, 'Favorite Fruit']);
});

test('a combobox not showing its list conveys that it is collapsed', async () => {
	await open(Basic);
	expectConveys(await readFor([say.combobox]), [say.combobox, say.collapsed]);
});

test('a combobox showing its list conveys expanded and a named listbox', async () => {
	await open(OpenList);
	expectConveys(await readFor([say.combobox]), [say.combobox, say.expanded]);
	expectConveys(await readFor([say.listbox]), [say.listbox, 'Favorite Fruit']);
});

test('the chosen option is the only one conveyed as selected', async () => {
	await open(Prefilled);
	expectConveys(await readFor(['Apple']), ['Apple', say.notSelected]);
	expectConveys(await readFor(['Banana']), ['Banana', say.selected]);
});

test('an option nobody may choose conveys that it is disabled', async () => {
	await open(UnavailableOptions);
	expectConveys(await readFor(['Premium']), ['Premium', say.disabled]);
});

// The field is a native disabled input, so the reader conveys it on the combobox itself.
test('a combobox nobody may touch conveys disabled on the combobox', async () => {
	await open(UnavailableOptions);
	expectConveys(await readFor([say.combobox, 'Archived plan']), [
		say.combobox,
		'Archived plan',
		say.disabled,
	]);
});

test('an inline combobox conveys a named listbox', async () => {
	await open(Inline);
	expectConveys(await readFor([say.listbox]), [say.listbox, 'Favorite Fruit']);
});

// Expected red, and not fixable here: `role="combobox"` carries an implicit collapsed state and popup, so a reader says them whatever the markup omits.
test.fails('an inline combobox claims no expanded state', async () => {
	await open(Inline);
	const entering = await readFor([say.combobox]);
	expect(missing(entering, [say.collapsed]), `${sr.name} announced "${entering}"`).toEqual([
		say.collapsed,
	]);
});

test('an invalid combobox conveys its message', async () => {
	await open(WithError);
	expectConveys(await readFor(['Pick a fruit that exists.']), ['Pick a fruit that exists.']);
});

// A bare `<select>` carries the combobox role natively, so failing to hide it puts the same choice in the tree twice - proven here by counting.
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

// Expected red: DOM focus stays in the field, so only aria-activedescendant could report the highlight, and the compiler does not emit it. The highlight is visible and inaudible.
test.fails('arrowing announces the option the highlight moved to', async () => {
	await open(OpenList);
	await readFor([say.combobox]);
	const apple = document.querySelector('[data-testid="apple"]');
	expect(apple, 'the scenario names its first option').not.toBeNull();

	await sr.press(sr.keys.arrowDown);
	await expect.poll(() => apple?.getAttribute('ui-highlighted')).toBe('');
	expectConveys(await sr.settleOnFocus(), ['Apple', say.option]);
});
