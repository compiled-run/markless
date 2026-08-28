import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import Bounded from './scenarios/bounded.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import Prefilled from './scenarios/prefilled.tsrx';
import WithHelpAndError from './scenarios/with-help-and-error.tsrx';

// Rows assert the facts an announcement must convey - role, name, value, bounds - never a reader product's wording.
const sr = virtualDriver;

/**
 * What one reader calls the facts a date box announcement has to convey.
 *
 * None of these are slots in the shared `Vocabulary`, for the reason
 * `slider.sr.ts` records: `spinbutton` has no slot, and a value or a bound is
 * spoken as a phrase around a number rather than as a fixed word. A reader whose
 * wording for a fact has never been observed answers with the empty string, which
 * `missing` below skips rather than failing against a word nobody has heard.
 */
type SegmentWords = {
	readonly spinbutton: string;
	readonly group: string;
	readonly value: (amount: number) => string;
	readonly bound: (edge: 'min' | 'max', amount: number) => string;
	readonly disabled: string;
	readonly invalid: string;
};

const unobserved = () => '';

const WORDS: Record<string, SegmentWords> = {
	// measured: this reader's own output for our markup
	virtual: {
		spinbutton: 'spinbutton',
		group: 'group',
		// With no aria-valuetext the reader speaks the bare number.
		value: (amount) => `${amount}`,
		bound: (edge, amount) => `${edge} value ${amount}`,
		disabled: 'disabled',
		invalid: 'invalid',
	},
	// unverified against our markup: this reader speaks a value, but the phrase it
	// wraps the number in has never been observed, so every numeric row skips it.
	NVDA: {
		spinbutton: 'spin button',
		group: 'grouping',
		value: unobserved,
		bound: unobserved,
		disabled: 'unavailable',
		invalid: 'invalid entry',
	},
	// unverified against our markup; same reason as above
	VoiceOver: {
		spinbutton: 'stepper',
		group: 'group',
		value: unobserved,
		bound: unobserved,
		disabled: 'dimmed',
		invalid: 'invalid data',
	},
};

const say = WORDS[sr.name] ?? WORDS.virtual;

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

// Walk forward until an announcement conveys everything asked for; a walk that never arrives is the same defect as a wrong phrase.
async function readFor(facts: readonly string[], limit = 20): Promise<string> {
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

// A step reaches the DOM after the dispatch the keystroke woke returns, so the reader is asked again until the new value is what it reads.
async function expectAnnouncesAfterChange(facts: readonly string[]) {
	await expect.poll(async () => missing(await sr.reannounce(), facts)).toEqual([]);
}

async function focusBox(testid: string) {
	const box = document.querySelector(`[data-testid="${testid}"]`) as HTMLElement;
	box.focus();
	await sr.settleOnFocus();
	return box;
}

test('the three boxes are announced inside a group that carries the name', async () => {
	await open(Basic);
	expectConveys(await readFor([say.group, 'Start date']), [say.group, 'Start date']);
});

test('each box conveys the spinbutton role and which part of the date it holds', async () => {
	await open(Basic);
	expectConveys(await readFor([say.spinbutton, 'month input']), [
		say.spinbutton,
		'month input',
	]);
	expectConveys(await readFor([say.spinbutton, 'day input']), [say.spinbutton, 'day input']);
	expectConveys(await readFor([say.spinbutton, 'year input']), [say.spinbutton, 'year input']);
});

test('a filled box conveys its value and the two bounds it may move between', async () => {
	await open(Prefilled);
	expectConveys(await readFor([say.spinbutton, 'month input']), [
		say.value(3),
		say.bound('min', 1),
		say.bound('max', 12),
	]);
});

// The day's ceiling is the chosen month's own length, not a flat 31.
test('the day box conveys the ceiling its month and year set', async () => {
	await open(Prefilled);
	expectConveys(await readFor([say.spinbutton, 'day input']), [
		say.value(30),
		say.bound('min', 1),
		say.bound('max', 31),
	]);
});

test('stepping a box with an arrow conveys the new value', async () => {
	await open(Prefilled);
	const month = await focusBox('monthinput');
	expectConveys(await sr.lastSpokenPhrase(), [say.spinbutton, say.value(3)]);

	await sr.press('ArrowUp');
	await expect.poll(() => month.getAttribute('aria-valuenow')).toBe('4');
	await expectAnnouncesAfterChange([say.spinbutton, say.value(4)]);
});

// Changing the month changes what the day box may hold, and a reader is told so.
test('choosing a shorter month conveys the day box\'s new ceiling', async () => {
	await open(Prefilled);
	const month = await focusBox('monthinput');
	const day = document.querySelector('[data-testid="dayinput"]') as HTMLElement;

	await sr.press('ArrowDown');
	await expect.poll(() => month.getAttribute('aria-valuenow')).toBe('2');
	await expect.poll(() => day.getAttribute('aria-valuemax')).toBe('29');
	await expect.poll(() => day.getAttribute('aria-valuenow')).toBe('29');
});

test('a date held between two bounds conveys the value it settles on', async () => {
	await open(Bounded);
	const day = await focusBox('dayinput');

	await sr.press('Home');
	await expect.poll(() => day.getAttribute('aria-valuenow')).toBe('10');
	await expectAnnouncesAfterChange([say.spinbutton, say.value(10)]);
});

test('a date nobody may change conveys that every box is unavailable', async () => {
	await open(Disabled);
	expectConveys(await readFor([say.spinbutton, 'month input']), [
		say.spinbutton,
		'month input',
		say.disabled,
	]);
});

// Both messages bind handles each box names through aria-describedby, so both are
// part of the boxes rather than separate items further down the page.
test('the error and the format hint are both conveyed with a box', async () => {
	await open(WithHelpAndError);
	const phrase = await readFor([say.spinbutton, 'month input']);
	// Whole-phrase containment: the hint carries commas of its own, and the driver
	// splits an announcement into facts on commas.
	expect(phrase, `${sr.name} announced "${phrase}"`).toContain('Enter a whole date');
	expect(phrase, `${sr.name} announced "${phrase}"`).toContain('(Month, day, then year)');
	// What is wrong is conveyed before the format hint.
	expect(phrase.indexOf('Enter a whole date')).toBeLessThan(
		phrase.indexOf('(Month, day, then year)'),
	);
});
