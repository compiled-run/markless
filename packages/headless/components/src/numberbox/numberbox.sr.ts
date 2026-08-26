import { render } from '@markless/vitest-browser';
import { userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import Currency from './scenarios/currency.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import Invalid from './scenarios/invalid.tsrx';
import MinMaxStep from './scenarios/min-max-step.tsrx';
import ReadOnly from './scenarios/readonly.tsrx';

// Rows assert the facts an announcement must convey - what the control is, its
// name, its value, its state - never a reader product's wording.
const sr = virtualDriver;

/**
 * What one reader calls the facts a number field announcement has to convey.
 *
 * None of these are slots in the shared `Vocabulary`, for the reason
 * `datebox.sr.ts` records for its own table: this family carries no `role`, so
 * what a reader speaks in the role's place is the `aria-roledescription` string,
 * and read-only has no slot either. A reader whose wording for a fact has never
 * been observed answers with the empty string, which `missing` skips rather than
 * failing against a word nobody has heard.
 */
type FieldWords = {
	readonly numberField: string;
	readonly readOnly: string;
	readonly disabled: string;
	readonly invalid: string;
};

const unobserved = '';

const WORDS: Record<string, FieldWords> = {
	// measured: this reader's own output for our markup
	virtual: {
		numberField: 'number field',
		readOnly: 'read only',
		disabled: 'disabled',
		invalid: 'invalid',
	},
	// unverified against our markup: `aria-roledescription` is spoken in the
	// role's place by both real readers, so the string itself carries over; the
	// state words are this reader's documented ones, never seen against these
	// elements.
	NVDA: {
		numberField: 'number field',
		readOnly: unobserved,
		disabled: 'unavailable',
		invalid: 'invalid entry',
	},
	// unverified against our markup; same reason as above
	VoiceOver: {
		numberField: 'number field',
		readOnly: unobserved,
		disabled: 'dimmed',
		invalid: 'invalid data',
	},
};

const say = WORDS[sr.name] ?? WORDS.virtual;

// One scenario per test: input ids are minted per container, so two live scenarios give two inputs the same id and every `<label for>` after the first resolves wrong.
async function open(component: Parameters<typeof render>[0]) {
	const { container } = await render(component);
	await sr.start(container as unknown as HTMLElement);
}

afterEach(async () => {
	await sr.stop().catch(() => {});
});

// An empty phrase is a reader with no word for the fact, not a fact it omitted.
function missing(phrase: string, facts: readonly string[]): string[] {
	const spoken = sr.segments(phrase);
	return facts.filter((fact) => fact !== '' && !spoken.includes(fact));
}

function expectConveys(phrase: string, facts: readonly string[]) {
	expect(missing(phrase, facts), `${sr.name} announced "${phrase}"`).toEqual([]);
}

function expectConveysFacts(phrase: string, conveys: Conveys) {
	expect(missingFacts(sr, phrase, conveys), `${sr.name} announced "${phrase}"`).toEqual([]);
}

// Walk forward until an announcement conveys everything asked for; a walk that never arrives is the same defect as a wrong phrase.
async function readFor(facts: readonly string[], limit = 24): Promise<string> {
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

// The family carries no `role="spinbutton"` - it cannot be focused with
// VoiceOver, and this control is real editable text - so what a reader speaks in
// the role's place is the roledescription.
test('the field is announced as a number field with the name its label gives it', async () => {
	await open(Basic);
	expectConveys(await readFor([say.numberField, 'Quantity']), [say.numberField, 'Quantity']);
});

// Dropping the spinbutton role drops `aria-valuemin` and `aria-valuemax` with it,
// so the range only reaches a reader if the consumer writes it in the
// description. This row is what makes that a requirement rather than a suggestion.
test('the range a field accepts is conveyed with the field itself', async () => {
	await open(MinMaxStep);
	const phrase = await readFor([say.numberField, 'Dose']);
	expect(phrase, `${sr.name} announced "${phrase}"`).toContain('between 0.5 and 3');
	expect(phrase, `${sr.name} announced "${phrase}"`).toContain('in steps of 0.25');
});

test('a field that arrives with a number conveys it the way the field shows it', async () => {
	await open(MinMaxStep);
	expectConveys(await readFor([say.numberField, 'Dose']), [say.numberField, 'Dose', '1.50']);
});

test('a money field conveys the number with its currency, not the plain digits', async () => {
	await open(Currency);
	expectConveys(await readFor([say.numberField, 'Price']), [
		say.numberField,
		'Price',
		'$1,299.00',
	]);
});

// Both messages bind handles the input names through aria-describedby, so both
// are part of the field rather than separate items further down the page.
test('a mounted error conveys the field as invalid, with the reason before the hint', async () => {
	await open(Invalid);
	const phrase = await readFor([say.numberField, 'Quantity', say.invalid]);
	expect(phrase, `${sr.name} announced "${phrase}"`).toContain('Enter at least one.');
	expect(phrase, `${sr.name} announced "${phrase}"`).toContain('A whole number, one or more.');
	// What is wrong is conveyed before the hint, wherever the two parts sit.
	expect(phrase.indexOf('Enter at least one.')).toBeLessThan(
		phrase.indexOf('A whole number, one or more.'),
	);
});

test('the root prop marks a field invalid on its own, with no error part mounted', async () => {
	await open(Invalid);
	expectConveys(await readFor([say.numberField, 'Flagged quantity']), [
		say.numberField,
		'Flagged quantity',
		say.invalid,
	]);
});

test('a number nobody may change conveys that the field is unavailable', async () => {
	await open(Disabled);
	expectConveys(await readFor([say.numberField, 'Quantity']), [
		say.numberField,
		'Quantity',
		say.disabled,
	]);
});

test('a number a person may read but not change conveys the restriction', async () => {
	await open(ReadOnly);
	expectConveys(await readFor([say.numberField, 'Quantity']), [
		say.numberField,
		'Quantity',
		say.readOnly,
	]);
});

test('both step buttons convey the direction they move the number', async () => {
	await open(Basic);
	expectConveysFacts(await readUntil(sr, { role: 'button', name: 'Decrease' }), {
		role: 'button',
		name: 'Decrease',
	});
	expectConveysFacts(await readUntil(sr, { role: 'button', name: 'Increase' }), {
		role: 'button',
		name: 'Increase',
	});
});

test('a step button nobody may press conveys that it is unavailable', async () => {
	await open(Disabled);
	expectConveysFacts(await readUntil(sr, { role: 'button', name: 'Decrease' }), {
		role: 'button',
		name: 'Decrease',
		state: ['disabled'],
	});
});

// A step reaches the DOM after the dispatch the keystroke woke returns, so the
// reader is asked again until the new number is what it reads.
test('stepping the field conveys the number it landed on', async () => {
	await open(MinMaxStep);
	const box = document.querySelector('[data-testid="input"]') as HTMLInputElement;
	box.focus();
	await sr.settleOnFocus();

	await userEvent.keyboard('{ArrowUp}');
	await expect.poll(() => box.value).toBe('1.75');
	await expect.poll(async () => (await sr.reannounce()).includes('1.75')).toBe(true);
});

// The root renders one always-present live region, because an announcement a
// consumer has to remember to mount is not a guarantee. This is the row that says
// a stepped number reaches it.
test('the number a step landed on reaches the live region the root renders', async () => {
	await open(MinMaxStep);
	const box = document.querySelector('[data-testid="input"]') as HTMLInputElement;
	box.focus();
	await sr.settleOnFocus();

	await userEvent.keyboard('{ArrowUp}');
	await expect.poll(() => box.value).toBe('1.75');
	const region = box.ownerDocument.querySelector('output[aria-live]') as HTMLElement;
	await expect.poll(() => region.textContent).toBe('1.75');
});
