import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import CustomRange from './scenarios/custom-range.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import Range from './scenarios/range.tsrx';
import Vertical from './scenarios/vertical.tsrx';

// Rows assert the facts an announcement must convey - role, name, value, bounds - never a reader product's wording.
const sr = virtualDriver;

/**
 * What one reader calls the facts a slider announcement has to convey.
 *
 * None of these are slots in the shared `Vocabulary`: the role has no slot, and a
 * value, a bound and an orientation are spoken as a phrase around a number rather
 * than as a fixed word, so they are written as functions. A reader whose wording
 * for a fact has never been observed answers with the empty string, which
 * `missing` below skips rather than failing against a word nobody has heard.
 */
type SliderWords = {
	readonly slider: string;
	readonly value: (amount: number) => string;
	readonly bound: (edge: 'min' | 'max', amount: number) => string;
	readonly along: (orientation: 'horizontal' | 'vertical') => string;
	readonly notDisabled: string;
	readonly disabled: string;
};

const unobserved = () => '';

const WORDS: Record<string, SliderWords> = {
	// measured: this reader's own output for our markup
	virtual: {
		slider: 'slider',
		value: (amount) => `current value ${amount}`,
		bound: (edge, amount) => `${edge} value ${amount}`,
		along: (orientation) =>
			`orientated ${orientation === 'vertical' ? 'vertically' : 'horizontally'}`,
		notDisabled: 'not disabled',
		disabled: 'disabled',
	},
	// unverified against our markup: this reader speaks a value, but the phrase it
	// wraps the number in has never been observed, so every numeric row skips it.
	NVDA: {
		slider: 'slider',
		value: unobserved,
		bound: unobserved,
		along: unobserved,
		notDisabled: '',
		disabled: 'unavailable',
	},
	// unverified against our markup; same reason as above
	VoiceOver: {
		slider: 'slider',
		value: unobserved,
		bound: unobserved,
		along: unobserved,
		notDisabled: '',
		disabled: 'dimmed',
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

async function focusThumb(testid: string) {
	const thumb = document.querySelector(`[data-testid="${testid}"]`) as HTMLElement;
	thumb.focus();
	await sr.settleOnFocus();
	return thumb;
}

test('the thumb conveys the slider role and the name of the whole control', async () => {
	await open(Basic);
	expectConveys(await readFor([say.slider]), [say.slider, 'Volume']);
});

test('the thumb conveys its value and the two bounds it may move between', async () => {
	await open(Basic);
	expectConveys(await readFor([say.slider]), [
		say.value(40),
		say.bound('min', 0),
		say.bound('max', 100),
	]);
});

// The bounds are the author's `min` and `max`, not the 0-to-100 default a reader would otherwise assume.
test('a slider with its own bounds conveys those bounds and not the defaults', async () => {
	await open(CustomRange);
	expectConveys(await readFor([say.slider]), [
		say.slider,
		'Temperature',
		say.value(25),
		say.bound('min', 5),
		say.bound('max', 105),
	]);
});

test('stepping up with an arrow key conveys the new value', async () => {
	await open(Basic);
	const thumb = await focusThumb('thumb');
	expectConveys(await sr.lastSpokenPhrase(), [say.slider, say.value(40)]);

	await sr.press('ArrowRight');
	await expect.poll(() => thumb.getAttribute('aria-valuenow')).toBe('41');
	await expectAnnouncesAfterChange([say.slider, say.value(41)]);
});

test('stepping down with an arrow key conveys the new value', async () => {
	await open(Basic);
	const thumb = await focusThumb('thumb');

	await sr.press('ArrowDown');
	await expect.poll(() => thumb.getAttribute('aria-valuenow')).toBe('39');
	await expectAnnouncesAfterChange([say.slider, say.value(39)]);
});

// Steps are counted from `min`, so this control reaches 35 and never 30.
test('a step larger than one moves the announced value by that step', async () => {
	await open(CustomRange);
	const thumb = await focusThumb('thumb');

	await sr.press('ArrowRight');
	await expect.poll(() => thumb.getAttribute('aria-valuenow')).toBe('35');
	await expectAnnouncesAfterChange([say.slider, say.value(35)]);
});

test('End and Home convey the two ends of the range', async () => {
	await open(Basic);
	const thumb = await focusThumb('thumb');

	await sr.press('End');
	await expect.poll(() => thumb.getAttribute('aria-valuenow')).toBe('100');
	await expectAnnouncesAfterChange([say.slider, say.value(100)]);

	await sr.press('Home');
	await expect.poll(() => thumb.getAttribute('aria-valuenow')).toBe('0');
	await expectAnnouncesAfterChange([say.slider, say.value(0)]);
});

// Both thumbs carry the same name, so a reader tells them apart by value and by the bound each one is held to: neither may cross the other.
test('a range slider conveys each of its two thumbs distinctly', async () => {
	await open(Range);
	expectConveys(await readFor([say.slider, say.value(20)]), [
		say.slider,
		'Price',
		say.value(20),
		say.bound('min', 0),
		say.bound('max', 80),
	]);
	expectConveys(await readFor([say.slider, say.value(80)]), [
		say.slider,
		'Price',
		say.value(80),
		say.bound('min', 20),
		say.bound('max', 100),
	]);
});

test('moving the lower thumb of a range conveys the new value on that thumb alone', async () => {
	await open(Range);
	const start = await focusThumb('start-thumb');
	const end = document.querySelector('[data-testid="end-thumb"]') as HTMLElement;

	await sr.press('ArrowRight');
	await expect.poll(() => start.getAttribute('aria-valuenow')).toBe('21');
	expect(end.getAttribute('aria-valuenow')).toBe('80');
	await expectAnnouncesAfterChange([say.slider, say.value(21)]);
});

test('a horizontal slider conveys that it runs horizontally', async () => {
	await open(Basic);
	expectConveys(await readFor([say.slider]), [say.slider, say.along('horizontal')]);
});

test('a vertical slider conveys that it runs vertically', async () => {
	await open(Vertical);
	expectConveys(await readFor([say.slider]), [say.slider, 'Height', say.along('vertical')]);
});

test('a slider nobody may move conveys that it is disabled', async () => {
	await open(Disabled);
	const spoken = await readFor([say.slider]);
	expectConveys(spoken, [say.slider, 'Volume', say.disabled]);
	// "not disabled" must be missing outright, not merely contained in the phrase's other words.
	expect(missing(spoken, [say.notDisabled]), `${sr.name} announced "${spoken}"`).toEqual([
		say.notDisabled,
	]);
});

test('an enabled slider conveys that it is not disabled', async () => {
	await open(Basic);
	expectConveys(await readFor([say.slider]), [say.slider, say.notDisabled]);
});
