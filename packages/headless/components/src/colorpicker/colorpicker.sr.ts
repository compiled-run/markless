import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import { parseColor } from './colorpicker-math.ts';
import { colorName } from './colorpicker-names.ts';
import Alpha from './scenarios/alpha.tsrx';
import Basic from './scenarios/basic.tsrx';
import Swatches from './scenarios/swatches.tsrx';
import TypedEntry from './scenarios/typed-entry.tsrx';

// Rows assert the facts an announcement must convey - role, name, value, state - never a reader product's wording.
const sr = virtualDriver;

/**
 * The two facts this family needs that no driver has a `Vocabulary` slot for.
 * `slider` records the same reason: the role has no slot, and a value is spoken
 * as a phrase around a number rather than as a fixed word. A reader whose wording
 * for a fact has never been observed answers with the empty string, which
 * `missing` below skips rather than failing against a word nobody has heard.
 */
type PickerWords = {
	readonly slider: string;
	/** What a reader says instead of the role word when `aria-roledescription` is set. */
	readonly plane: string;
	/** The phrase a reader wraps `aria-valuetext` in. */
	readonly value: (text: string) => string;
	readonly pressed: string;
	readonly notPressed: string;
};

const unobserved = () => '';

const WORDS: Record<string, PickerWords> = {
	// measured: this reader's own output for our markup
	virtual: {
		slider: 'slider',
		plane: '2D Slider',
		value: (text) => `current value ${text}`,
		pressed: 'pressed',
		notPressed: 'not pressed',
	},
	// unverified against our markup: both readers have a documented word for the
	// slider role, and neither's phrasing around a value has been observed.
	NVDA: { slider: 'slider', plane: '', value: unobserved, pressed: '', notPressed: '' },
	VoiceOver: { slider: 'slider', plane: '', value: unobserved, pressed: '', notPressed: '' },
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
async function readFor(facts: readonly string[], limit = 30): Promise<string> {
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

async function focusPart(testid: string) {
	const target = document.querySelector(`[data-testid="${testid}"]`) as HTMLElement;
	target.focus();
	await sr.settleOnFocus();
	return target;
}

async function focusAxis(axis: 'x' | 'y') {
	const target = document.querySelector(`[ui-axis="${axis}"]`) as HTMLElement;
	target.focus();
	await sr.settleOnFocus();
	return target;
}

// The plane is a group and each axis is a control inside it, so the name a reader
// hears on an axis is the axis, and the colour comes with the value.
test('the saturation axis conveys the slider role, its own name and the colour', async () => {
	await open(Basic);
	expectConveys(await readFor([say.plane, say.value('Saturation: 80%')]), [
		say.plane,
		'Saturation',
		say.value('Saturation: 80%'),
		'Brightness: 100%',
		'Hue: 210°',
		'vibrant cyan blue',
	]);
});

test('the brightness axis is a control of its own, not a value on the first one', async () => {
	await open(Basic);
	expectConveys(await readFor([say.plane, say.value('Brightness: 100%')]), [
		say.plane,
		'Brightness',
		say.value('Brightness: 100%'),
	]);
});

// The hue rail speaks the hue's own name, not the whole colour's: "cyan blue"
// rather than "vibrant cyan blue".
test('the hue rail conveys its channel, its degrees and the hue name', async () => {
	await open(Basic);
	const spoken = await readFor([say.slider, say.value('Hue: 210°')]);
	expectConveys(spoken, [say.slider, 'Hue', say.value('Hue: 210°'), 'cyan blue']);
	expect(missing(spoken, ['vibrant cyan blue']), `${sr.name} announced "${spoken}"`).toEqual([
		'vibrant cyan blue',
	]);
});

// Alpha carries no colour name at all: repeating one there tells a person nothing
// they did not just hear, and the name form already changes below full opacity.
test('the alpha rail conveys its own percentage and no colour name', async () => {
	await open(Alpha);
	const spoken = await readFor([say.slider, say.value('Alpha: 50%')]);
	expectConveys(spoken, [say.slider, 'Alpha', say.value('Alpha: 50%')]);
	expect(
		missing(spoken, ['50% transparent vibrant cyan blue']),
		`${sr.name} announced "${spoken}"`,
	).toEqual(['50% transparent vibrant cyan blue']);
});

test('a translucent colour is named as transparent rather than given an alpha number', async () => {
	await open(Alpha);
	expectConveys(await readFor(['50% transparent vibrant cyan blue']), [
		'50% transparent vibrant cyan blue',
	]);
});

test('stepping the plane conveys the channel that moved and the new colour', async () => {
	await open(Basic);
	const axis = await focusAxis('x');

	await sr.press('ArrowLeft');
	await expect.poll(() => axis.getAttribute('aria-valuenow')).toBe('79');
	await expectAnnouncesAfterChange([
		say.plane,
		say.value('Saturation: 79%'),
		'vibrant cyan blue',
	]);
});

test('stepping the hue rail conveys the new degrees and the new hue name', async () => {
	await open(Basic);
	const thumb = await focusPart('hue-thumb');

	await sr.press('ArrowRight');
	await expect.poll(() => thumb.getAttribute('aria-valuenow')).toBe('211');
	await expectAnnouncesAfterChange([say.slider, say.value('Hue: 211°')]);
});

test('the hex box conveys the text-entry role, its name and what it holds', async () => {
	await open(TypedEntry);
	expectConveys(await readFor([sr.vocabulary.textbox, 'Hex']), [
		sr.vocabulary.textbox,
		'Hex',
		'#3399FF',
	]);
});

test('an entry the box cannot read as a colour conveys that it is invalid', async () => {
	await open(TypedEntry);
	const box = document.querySelector('[data-testid="hex-input"]') as HTMLInputElement;
	box.focus();
	box.value = 'nonsense';
	box.dispatchEvent(new Event('input', { bubbles: true }));
	await expect.poll(() => box.getAttribute('aria-invalid')).toBe('true');

	// Read again from the element rather than asking for a repeat: the state
	// changed under a cursor that had already spoken.
	await focusPart('hue-thumb');
	await focusPart('hex-input');
	expectConveys(await sr.lastSpokenPhrase(), [
		sr.vocabulary.textbox,
		'Hex',
		sr.vocabulary.invalid,
	]);
});

test('a swatch conveys the button role, its colour by name and by value, and that it is in force', async () => {
	await open(Swatches);
	expectConveys(await readFor([sr.vocabulary.button, 'vibrant cyan blue']), [
		sr.vocabulary.button,
		'vibrant cyan blue',
		'#3399FF',
		say.pressed,
	]);
});

test('a swatch that is not the colour in force conveys that too', async () => {
	await open(Swatches);
	const named = colorName(parseColor('#FF3366')!, false);
	const spoken = await readFor([sr.vocabulary.button, '#FF3366']);
	expectConveys(spoken, [sr.vocabulary.button, named, '#FF3366', say.notPressed]);
});

test('the value label conveys the colour in words and in hex', async () => {
	await open(Basic);
	expectConveys(await readFor(['vibrant cyan blue', '#3399FF']), [
		'vibrant cyan blue',
		'#3399FF',
	]);
});
