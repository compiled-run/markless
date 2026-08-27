import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import Curve from './scenarios/curve.tsrx';

// Rows assert the facts an announcement must convey - role, name, value, state - never a reader product's wording.
const sr = virtualDriver;

/**
 * The two facts this family needs that no driver has a `Vocabulary` slot for.
 * `slider` and `colorpicker` record the same reason: the role has no slot, and a
 * value is spoken as a phrase around a number rather than as a fixed word. A
 * reader whose wording for a fact has never been observed answers with the empty
 * string, which `missing` below skips rather than failing against a word nobody
 * has heard.
 */
type PadWords = {
	readonly slider: string;
	/** What a reader says instead of the role word when `aria-roledescription` is set. */
	readonly plane: string;
	/** The phrase a reader wraps `aria-valuetext` in. */
	readonly value: (text: string) => string;
};

const unobserved = () => '';

const WORDS: Record<string, PadWords> = {
	// measured: this reader's own output for our markup
	virtual: {
		slider: 'slider',
		plane: '2D slider',
		value: (text) => `current value ${text}`,
	},
	// unverified against our markup: both readers have a documented word for the
	// slider role, and neither's phrasing around a value has been observed.
	NVDA: { slider: 'slider', plane: '', value: unobserved },
	VoiceOver: { slider: 'slider', plane: '', value: unobserved },
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

/**
 * Where in one forward walk each set of facts is first conveyed. Two handles are
 * two stops only if the walk reaches them at two different places, so this
 * answers with the step each landed on rather than merely that both were heard.
 */
async function readWalk(
	wanted: ReadonlyArray<readonly string[]>,
	limit = 40,
): Promise<number[]> {
	const landed = wanted.map(() => -1);
	const seen: string[] = [];
	let phrase = await sr.lastSpokenPhrase();
	for (let step = 0; step <= limit; step++) {
		seen.push(phrase);
		for (let at = 0; at < wanted.length; at++) {
			if (landed[at] < 0 && missing(phrase, wanted[at]).length === 0) landed[at] = step;
		}
		if (landed.every((where) => where >= 0)) return landed;
		await sr.next();
		phrase = await sr.lastSpokenPhrase();
	}
	throw new Error(
		`${sr.name} never announced ${JSON.stringify(wanted)} in ${limit} steps.\n` +
			`Transcript: ${JSON.stringify(seen, null, 1)}`,
	);
}

// A step reaches the DOM after the dispatch the keystroke woke returns, so the reader is asked again until the new value is what it reads.
async function expectAnnouncesAfterChange(facts: readonly string[]) {
	await expect.poll(async () => missing(await sr.reannounce(), facts)).toEqual([]);
}

function handles(): HTMLElement[] {
	return Array.from(document.querySelectorAll<HTMLElement>('[ui-handle]'));
}

async function focusHandle(at: number) {
	const target = handles()[at];
	target.focus();
	await sr.settleOnFocus();
	return target;
}

// The whole point of the design: one control per handle, announced as a 2D
// slider, carrying both numbers. Nothing here hears one axis and not the other.
test('a handle conveys the 2D slider role, the pad name and both of its numbers', async () => {
	await open(Basic);
	// The reader splits an announcement on its commas, so the two numbers arrive
	// as two facts rather than one phrase.
	expectConveys(await readFor([say.plane, say.value('X 0.25'), 'Y 0.75']), [
		say.plane,
		'Shadow offset',
		say.value('X 0.25'),
		'Y 0.75',
	]);
});

test('the field is conveyed as a group carrying the pad name', async () => {
	await open(Basic);
	expectConveys(await readFor([sr.vocabulary.group, 'Shadow offset']), [
		sr.vocabulary.group,
		'Shadow offset',
	]);
});

test('stepping a handle conveys the axis that moved and its new number', async () => {
	await open(Basic);
	const thumb = await focusHandle(0);

	await sr.press('ArrowRight');
	await expect.poll(() => thumb.getAttribute('aria-valuenow')).toBe('0.26');
	await expectAnnouncesAfterChange([say.plane, say.value('X 0.26')]);
});

// Changing axis goes back to the long form, so a person who moves y after moving
// x hears where both axes now stand rather than a bare y.
test('moving onto the other axis conveys both numbers again', async () => {
	await open(Basic);
	const thumb = await focusHandle(0);

	await sr.press('ArrowRight');
	await expect.poll(() => thumb.getAttribute('aria-valuenow')).toBe('0.26');

	await sr.press('ArrowUp');
	await expect.poll(() => thumb.getAttribute('aria-valuenow')).toBe('0.76');
	await expectAnnouncesAfterChange([say.plane, say.value('X 0.26'), 'Y 0.76']);
});

test('two control points are two stops, each announcing its own value', async () => {
	await open(Curve);
	const [first, second] = await readWalk([
		[say.plane, say.value('X 0.25'), 'Y 0.1'],
		[say.plane, say.value('X 0.75'), 'Y 0.9'],
	]);
	expect(first, 'the two handles landed on one stop').not.toBe(second);
});

test('the handle a key moved is the only one whose announcement changes', async () => {
	await open(Curve);
	const thumb = await focusHandle(1);

	await sr.press('ArrowUp');
	await expect.poll(() => thumb.getAttribute('aria-valuenow')).toBe('0.91');
	await expectAnnouncesAfterChange([say.plane, say.value('X 0.75'), 'Y 0.91']);

	const other = await focusHandle(0);
	expect(other.getAttribute('aria-valuetext')).toBe('X 0.25, Y 0.1');
	expectConveys(await sr.lastSpokenPhrase(), [say.plane, say.value('X 0.25'), 'Y 0.1']);
});
