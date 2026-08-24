import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import Tabbed from './scenarios/tabbed.tsrx';
import Untitled from './scenarios/untitled.tsrx';

// Rows assert the facts an announcement must convey - role, name, state - never a reader product's wording.
const sr = virtualDriver;

async function open(component: Parameters<typeof render>[0]) {
	const { container } = await render(component);
	await sr.start(container as unknown as HTMLElement);
	return container as unknown as HTMLElement;
}

/** Rows that start the rotation must stop it: teardown never reaches the interval, and every tick throws out of the compiled callback, reddening the lane. */
async function stopRotation() {
	await sr.press(sr.keys.enter);
}

afterEach(async () => {
	await sr.stop().catch(() => {});
});

function expectConveys(phrase: string, conveys: Conveys) {
	expect(missingFacts(sr, phrase, conveys), `${sr.name} announced "${phrase}"`).toEqual([]);
}

function expectDoesNotConvey(phrase: string, conveys: Conveys) {
	expect(missingFacts(sr, phrase, conveys), `${sr.name} announced "${phrase}"`).not.toEqual([]);
}

/** Comfortably more items than any scenario here has, so a lap always wraps. */
const LAP = 20;

/** Re-read an item after a gesture - laps, not seconds: `reannounce()` steps off the item, and a wall-clock deadline is spent walking, so the outcome would track the scenario's item count. */
async function readAgainUntil(conveys: Conveys) {
	return readUntil(sr, conveys, 2 * LAP);
}

/** Park the reading cursor on the first item whose phrase carries `word`. */
async function readUntilWord(word: string, limit = 2 * LAP) {
	const seen: string[] = [];
	let phrase = await sr.lastSpokenPhrase();
	for (let step = 0; step <= limit; step++) {
		seen.push(phrase);
		if (phrase.includes(word)) return phrase;
		await sr.next();
		phrase = await sr.lastSpokenPhrase();
	}
	throw new Error(
		`${sr.name} never announced "${word}" in ${limit} steps.\n` +
			`Transcript: ${JSON.stringify(seen, null, 1)}`,
	);
}

test('entering the carousel conveys that it is a carousel', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'carousel' }), { role: 'carousel' });
});

// Expected red: the root cannot read a handle in an IDREF position, so it wires no aria-labelledby to the title.
test.fails('a titled carousel is named by its title', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'carousel' }), {
		role: 'carousel',
		name: 'Featured destinations',
	});
});

test('an untitled carousel conveys the carousel and no invented name', async () => {
	await open(Untitled);
	const entry = await readUntil(sr, { role: 'carousel' });
	expectConveys(entry, { role: 'carousel' });
	expectDoesNotConvey(entry, { name: 'content slideshow' });
	expect(sr.segments(entry), `${sr.name} announced "${entry}"`).toEqual([
		sr.vocabulary.carousel,
	]);
});

test('arriving on a slide conveys that it is a slide', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'slide' }), { role: 'slide' });
});

// Expected red: a slide name needs a render-time ordinal and sibling count, neither of which exists, so the item writes no aria-label.
test.fails('a slide is named with its position in the set', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'slide' }), { role: 'slide', name: '1 of 3' });
});

test('a slide in the tabbed variant conveys the panel and never also a slide', async () => {
	await open(Tabbed);
	const panel = await readUntil(sr, { role: 'tabpanel' });
	expectConveys(panel, { role: 'tabpanel' });
	expectDoesNotConvey(panel, { role: 'slide' });
});

test('the picker for the showing slide conveys tab, its name and that it is chosen', async () => {
	await open(Tabbed);
	expectConveys(await readUntil(sr, { role: 'tab', name: '1' }), {
		role: 'tab',
		name: '1',
		state: ['selected'],
	});
	const other = await readUntil(sr, { role: 'tab', name: '2' });
	expectConveys(other, { role: 'tab', name: '2' });
	expectDoesNotConvey(other, { state: ['selected'] });
});

// These names come from the family, not the scenario's "Back"/"Next" children, so an unlabelled step control is a family regression.
test('the step controls convey the button role and which way they move', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'button', name: 'Previous slide' }), {
		role: 'button',
		name: 'Previous slide',
	});
	expectConveys(await readUntil(sr, { role: 'button', name: 'Next slide' }), {
		role: 'button',
		name: 'Next slide',
	});
});

test('the rotation control conveys the action it will perform, and flips once used', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'button', name: 'start automatic slide show' }), {
		role: 'button',
		name: 'start automatic slide show',
	});
	await sr.press(sr.keys.enter);
	await readAgainUntil({ role: 'button', name: 'stop automatic slide show' });
	// Back to rest, and the row's cleanup - see stopRotation().
	await stopRotation();
	await readAgainUntil({ role: 'button', name: 'start automatic slide show' });
});

// No vocabulary slot exists for a fact that must be absent, so this reads the reader's own word out of the phrase.
test('the rotation control is never conveyed as a pressed toggle', async () => {
	await open(Basic);
	const control = await readUntil(sr, { role: 'button', name: 'start automatic slide show' });
	expect(control, `${sr.name} announced "${control}"`).not.toContain('pressed');
	await sr.press(sr.keys.enter);
	const after = await readAgainUntil({
		role: 'button',
		name: 'stop automatic slide show',
	});
	expect(after, `${sr.name} announced "${after}"`).not.toContain('pressed');
	await stopRotation();
});

// This reader announces no live region, so these two rows pin the static wiring an announcement would depend on rather than a phrase.
test('the root is a polite live region while nothing is rotating', async () => {
	const container = await open(Basic);
	const root = container.querySelector('[data-testid="root"]');
	expect(root?.getAttribute('aria-live')).toBe('polite');
	expect(root?.getAttribute('aria-atomic')).toBe('false');
	await readUntilWord('Next slide');
	await sr.press(sr.keys.enter);
	await expect
		.poll(() => container.querySelector('[ui-active]')?.getAttribute('ui-value'))
		.toBe('oslo');
	expect(root?.getAttribute('aria-live')).toBe('polite');
});

test('starting the rotation silences the live region', async () => {
	const container = await open(Basic);
	const root = container.querySelector('[data-testid="root"]');
	expect(root?.getAttribute('aria-live')).toBe('polite');
	await readUntil(sr, { role: 'button', name: 'start automatic slide show' });
	await sr.press(sr.keys.enter);
	await expect.poll(() => root?.getAttribute('aria-live')).toBe('off');
	await stopRotation();
});
