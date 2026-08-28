import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import Collapsible from './scenarios/collapsible.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import Nested from './scenarios/nested.tsrx';
import Vertical from './scenarios/vertical.tsrx';

// Rows assert the facts an announcement must convey - name, value, bounds - never a reader product's wording.
const sr = virtualDriver;

/**
 * What one reader calls the facts a window splitter's announcement has to convey.
 *
 * None of these are slots in the shared `Vocabulary`: the role has no slot, and a
 * value, a bound and an axis are spoken as a phrase around a number rather than
 * as a fixed word, so they are written as functions. A reader whose wording for a
 * fact has never been observed answers with the empty string, which `missing`
 * below skips rather than failing against a word nobody has heard.
 *
 * One whole announcement, captured from the virtual reader on this tree, is what
 * the virtual column is written from: "separator, Resize navigation, orientated
 * vertically, max value 80, min value 10, 1 control, not disabled, current value
 * 30%". Two of those a guess would have got wrong — the value arrives wrapped in
 * "current value" and carries the `aria-valuetext` percent sign rather than a
 * bare decimal, and `aria-controls` is spoken as a count of controlled elements.
 */
type SplitterWords = {
	readonly splitter: string;
	readonly value: (amount: number) => string;
	readonly bound: (edge: 'min' | 'max', amount: number) => string;
	readonly along: (orientation: 'horizontal' | 'vertical') => string;
	readonly controls: string;
	readonly notDisabled: string;
	readonly disabled: string;
};

const unobserved = () => '';

const WORDS: Record<string, SplitterWords> = {
	// measured: this reader's own output for our markup
	virtual: {
		splitter: 'separator',
		value: (amount) => `current value ${amount}%`,
		bound: (edge, amount) => `${edge} value ${amount}`,
		along: (orientation) =>
			`orientated ${orientation === 'vertical' ? 'vertically' : 'horizontally'}`,
		controls: '1 control',
		notDisabled: 'not disabled',
		disabled: 'disabled',
	},
	// unverified against our markup: these readers speak a splitter and a value,
	// but the phrase each wraps its numbers in has never been observed here, so
	// every numeric row skips it.
	NVDA: {
		splitter: 'splitter',
		value: unobserved,
		bound: unobserved,
		along: unobserved,
		controls: '',
		notDisabled: '',
		disabled: 'unavailable',
	},
	VoiceOver: {
		splitter: 'splitter',
		value: unobserved,
		bound: unobserved,
		along: unobserved,
		controls: '',
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

// A step reaches the DOM after the dispatch the keystroke woke returns, so the reader is asked again until the new size is what it reads.
async function expectAnnouncesAfterChange(facts: readonly string[]) {
	await expect.poll(async () => missing(await sr.reannounce(), facts)).toEqual([]);
}

async function focusThumb(testid: string) {
	const divider = document.querySelector(`[data-testid="${testid}"]`) as HTMLElement;
	divider.focus();
	await sr.settleOnFocus();
	return divider;
}

test('the divider conveys the splitter role and the name it was given', async () => {
	await open(Basic);
	expectConveys(await readFor(['Resize navigation']), [say.splitter, 'Resize navigation']);
});

test('the divider conveys the size of the panel it resizes and the two limits it may move between', async () => {
	await open(Basic);
	expectConveys(await readFor(['Resize navigation']), [
		say.value(30),
		say.bound('min', 10),
		say.bound('max', 80),
	]);
});

// aria-controls is what APG requires of a window splitter, and this is the one
// route that says a reader receives it rather than that the markup carries it.
test('the divider conveys that it controls the panel it resizes', async () => {
	await open(Basic);
	expectConveys(await readFor(['Resize navigation']), [say.splitter, say.controls]);
});

test('stepping with an arrow key conveys the new size', async () => {
	await open(Basic);
	const divider = await focusThumb('thumb');

	await sr.press('ArrowRight');
	await expect.poll(() => divider.getAttribute('aria-valuenow')).toBe('31');
	await expectAnnouncesAfterChange([say.splitter, say.value(31)]);
});

test('End conveys the largest size the panel is allowed', async () => {
	await open(Basic);
	const divider = await focusThumb('thumb');

	await sr.press('End');
	await expect.poll(() => divider.getAttribute('aria-valuenow')).toBe('80');
	await expectAnnouncesAfterChange([say.splitter, say.value(80)]);
});

test('collapsing with Enter conveys the collapsed size', async () => {
	await open(Collapsible);
	const divider = await focusThumb('thumb');

	await sr.press('Enter');
	await expect.poll(() => divider.getAttribute('aria-valuenow')).toBe('5');
	await expectAnnouncesAfterChange([say.splitter, say.value(5)]);
});

// The splitter's own axis is the perpendicular of the group's: panels stacked one
// above the other are parted by a horizontal splitter, and this is what a reader
// says about it.
test('a stacked group conveys a horizontal splitter over its own size', async () => {
	await open(Vertical);
	expectConveys(await readFor(['Resize preview']), [
		say.splitter,
		'Resize preview',
		say.along('horizontal'),
		say.value(60),
	]);
});

// Both levels are one widget with one record, so each divider reads as a splitter
// over its own panel, on its own axis.
test('a nested group conveys a divider at each level, on its own axis', async () => {
	await open(Nested);
	expectConveys(await readFor(['Resize navigation']), [
		say.splitter,
		say.along('vertical'),
		say.value(30),
	]);
	expectConveys(await readFor(['Resize preview']), [
		say.splitter,
		say.along('horizontal'),
		say.value(60),
	]);
});

test('a widget nobody may resize conveys that it is disabled', async () => {
	await open(Disabled);
	const spoken = await readFor(['Resize navigation']);
	expectConveys(spoken, ['Resize navigation', say.disabled]);
	// "not disabled" must be missing outright, not merely contained in the phrase's other words.
	expect(missing(spoken, [say.notDisabled]), `${sr.name} announced "${spoken}"`).toEqual([
		say.notDisabled,
	]);
});

test('a widget that can be resized conveys that it is not disabled', async () => {
	await open(Basic);
	expectConveys(await readFor(['Resize navigation']), [say.splitter, say.notDisabled]);
});
