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
 * None of these are slots in the shared `Vocabulary`, and unlike slider's table
 * **none of the role wording here has been captured yet**: the splitter is the
 * first `role="separator"` widget in this package, and this file was written
 * before the lane could be run on this tree. Every word nobody has heard is
 * `unobserved`, which `missing` skips rather than failing against a guess, so
 * these rows assert the name and the number and leave the role word to the first
 * run that captures it. Filling the role word in is the first job of whoever
 * runs this lane.
 */
type SplitterWords = {
	readonly splitter: string;
	readonly value: (amount: number) => string;
	readonly bound: (edge: 'min' | 'max', amount: number) => string;
	readonly disabled: string;
};

const unobserved = () => '';

const WORDS: Record<string, SplitterWords> = {
	virtual: {
		splitter: '',
		// With aria-valuetext present the reader speaks the text, not the bare number.
		value: (amount) => `${amount}%`,
		bound: unobserved,
		disabled: 'disabled',
	},
	NVDA: {
		splitter: '',
		value: unobserved,
		bound: unobserved,
		disabled: 'unavailable',
	},
	VoiceOver: {
		splitter: '',
		value: unobserved,
		bound: unobserved,
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

test('the divider conveys the name it was given', async () => {
	await open(Basic);
	expectConveys(await readFor(['Resize navigation']), [say.splitter, 'Resize navigation']);
});

test('the divider conveys the size of the panel it resizes', async () => {
	await open(Basic);
	expectConveys(await readFor(['Resize navigation']), [say.value(30), say.bound('min', 10), say.bound('max', 80)]);
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

test('a stacked group conveys its own divider and size', async () => {
	await open(Vertical);
	expectConveys(await readFor(['Resize preview']), [say.splitter, 'Resize preview', say.value(60)]);
});

// Both levels are one widget with one record, so both dividers read as splitters over their own panels.
test('a nested group conveys a divider at each level', async () => {
	await open(Nested);
	expectConveys(await readFor(['Resize navigation']), [say.splitter, say.value(30)]);
	expectConveys(await readFor(['Resize preview']), [say.splitter, say.value(60)]);
});

test('a widget nobody may resize conveys that it is disabled', async () => {
	await open(Disabled);
	expectConveys(await readFor(['Resize navigation']), ['Resize navigation', say.disabled]);
});
