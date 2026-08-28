import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import Prefilled from './scenarios/prefilled.tsrx';
import ReadOnly from './scenarios/readonly.tsrx';
import TwentyFourHour from './scenarios/twenty-four-hour.tsrx';
import WithHelpAndError from './scenarios/with-help-and-error.tsrx';
import WithSeconds from './scenarios/with-seconds.tsrx';

// Rows assert the facts an announcement must convey - role, name, value, bounds - never a reader product's wording.
const sr = virtualDriver;

/**
 * What one reader calls the facts a time box announcement has to convey.
 *
 * None of these are slots in the shared `Vocabulary`, for the reason
 * `datebox.sr.ts` and `slider.sr.ts` record for theirs: `spinbutton` has no slot,
 * and a value or a bound is spoken as a phrase around a number rather than as a
 * fixed word. A reader whose wording for a fact has never been observed answers
 * with the empty string, which `missing` below skips rather than failing against
 * a word nobody has heard.
 */
type SegmentWords = {
	readonly spinbutton: string;
	readonly group: string;
	readonly value: (amount: number) => string;
	readonly bound: (edge: 'min' | 'max', amount: number) => string;
	readonly disabled: string;
	readonly readOnly: string;
	readonly invalid: string;
};

const unobserved = () => '';
const unheard = '';

const WORDS: Record<string, SegmentWords> = {
	// measured: this reader's own output for our markup
	virtual: {
		spinbutton: 'spinbutton',
		group: 'group',
		// A numeric box renders no aria-valuetext, so the reader speaks the bare
		// number; the period box renders one, and its words are asserted directly.
		value: (amount) => `${amount}`,
		bound: (edge, amount) => `${edge} value ${amount}`,
		disabled: 'disabled',
		readOnly: 'read only',
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
		readOnly: unheard,
		invalid: 'invalid entry',
	},
	// unverified against our markup; same reason as above
	VoiceOver: {
		spinbutton: 'stepper',
		group: 'group',
		value: unobserved,
		bound: unobserved,
		disabled: 'dimmed',
		readOnly: unheard,
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

test('the boxes are announced inside a group that carries the name', async () => {
	await open(Basic);
	expectConveys(await readFor([say.group, 'Start time']), [say.group, 'Start time']);
});

test('each box conveys the spinbutton role and which part of the time it holds', async () => {
	await open(Basic);
	expectConveys(await readFor([say.spinbutton, 'hour input']), [say.spinbutton, 'hour input']);
	expectConveys(await readFor([say.spinbutton, 'minute input']), [
		say.spinbutton,
		'minute input',
	]);
	// The period box is named for what a person picks in it, not for the Intl part
	// type it comes from: "dayperiod input" is a spelling nobody says out loud.
	expectConveys(await readFor([say.spinbutton, 'AM or PM']), [say.spinbutton, 'AM or PM']);
});

test('a filled box conveys its value and the two bounds it may move between', async () => {
	await open(Prefilled);
	expectConveys(await readFor([say.spinbutton, 'hour input']), [
		say.value(2),
		say.bound('min', 1),
		say.bound('max', 12),
	]);
	expectConveys(await readFor([say.spinbutton, 'minute input']), [
		say.value(30),
		say.bound('min', 0),
		say.bound('max', 59),
	]);
});

/**
 * The one place this family renders `aria-valuetext` where `datebox` renders
 * none. A period box's `aria-valuenow` is 0 or 1, and a reader that speaks a bare
 * "0" has conveyed nothing at all - so the words are asserted rather than the
 * number, and this is the row that would catch the attribute going missing.
 */
test('the period box conveys the half of the day in words rather than as a number', async () => {
	await open(Prefilled);
	const phrase = await readFor([say.spinbutton, 'AM or PM']);
	expect(phrase, `${sr.name} announced "${phrase}"`).toContain('PM');
});

test('a 24-hour clock conveys an hour that may run to 23', async () => {
	await open(TwentyFourHour);
	expectConveys(await readFor([say.spinbutton, 'hour input']), [
		say.bound('min', 0),
		say.bound('max', 23),
	]);
});

test('a time carrying seconds announces the third box for what it holds', async () => {
	await open(WithSeconds);
	expectConveys(await readFor([say.spinbutton, 'second input']), [
		say.spinbutton,
		'second input',
		say.value(7),
	]);
});

test('stepping a box with an arrow conveys the new value', async () => {
	await open(Prefilled);
	const hour = await focusBox('hourinput');
	expectConveys(await sr.lastSpokenPhrase(), [say.spinbutton, say.value(2)]);

	await sr.press('ArrowUp');
	await expect.poll(() => hour.getAttribute('aria-valuenow')).toBe('3');
	await expectAnnouncesAfterChange([say.spinbutton, say.value(3)]);
});

// The wrap is the behaviour a person notices first, and it has to reach a reader
// as a value rather than as silence.
test('an hour wrapped round the clock conveys where it landed', async () => {
	await open(Prefilled);
	const hour = await focusBox('hourinput');

	await sr.press('ArrowDown');
	await expect.poll(() => hour.getAttribute('aria-valuenow')).toBe('1');
	await sr.press('ArrowDown');
	await expect.poll(() => hour.getAttribute('aria-valuenow')).toBe('12');
	await expectAnnouncesAfterChange([say.spinbutton, say.value(12)]);
});

test('toggling the period conveys the new half of the day', async () => {
	await open(Prefilled);
	const period = await focusBox('dayperiodinput');

	await sr.press('ArrowUp');
	await expect.poll(() => period.getAttribute('aria-valuetext')).toBe('AM');
	await expect.poll(async () => (await sr.reannounce()).includes('AM')).toBe(true);
});

test('a time nobody may change conveys that every box is unavailable', async () => {
	await open(Disabled);
	expectConveys(await readFor([say.spinbutton, 'hour input']), [
		say.spinbutton,
		'hour input',
		say.disabled,
	]);
});

test('a time nobody may edit conveys that it is read only', async () => {
	await open(ReadOnly);
	expectConveys(await readFor([say.spinbutton, 'hour input']), [
		say.spinbutton,
		'hour input',
		say.readOnly,
	]);
});

// Both messages bind handles each box names through aria-describedby, so both are
// part of the boxes rather than separate items further down the page.
test('the error and the format hint are both conveyed with a box', async () => {
	await open(WithHelpAndError);
	const phrase = await readFor([say.spinbutton, 'hour input']);
	// Whole-phrase containment: the hint carries commas of its own, and the driver
	// splits an announcement into facts on commas.
	expect(phrase, `${sr.name} announced "${phrase}"`).toContain('Enter a whole time');
	expect(phrase, `${sr.name} announced "${phrase}"`).toContain('(Hour, minute, then AM or PM)');
	// What is wrong is conveyed before the format hint.
	expect(phrase.indexOf('Enter a whole time')).toBeLessThan(
		phrase.indexOf('(Hour, minute, then AM or PM)'),
	);
});
