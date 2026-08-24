// Every skipped row rests on one limitation: the root is both the group element and the select-all's checkbox root, so one label names both.
import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import Partial from './scenarios/partial.tsrx';
import UnavailableOptions from './scenarios/unavailable-options.tsrx';

// Rows assert the facts an announcement must convey - role, name, state - never a reader product's wording.
const sr = virtualDriver;

// One scenario per test: trigger ids are minted per container, so two live scenarios give two elements the same id and every `<label for>` after the first resolves wrong.
async function open(component: Parameters<typeof render>[0]) {
	const { container } = await render(component);
	await sr.start(container as unknown as HTMLElement);
}

afterEach(async () => {
	await sr.stop().catch(() => {});
});

function expectConveys(phrase: string, conveys: Conveys) {
	expect(missingFacts(sr, phrase, conveys), `${sr.name} announced "${phrase}"`).toEqual([]);
}

// A toggle reaches the DOM after the dispatch it woke returns, so the reader is asked again until the new state is what it reads.
async function expectAnnouncesAfterChange(conveys: Conveys) {
	await expect.poll(async () => missingFacts(sr, await sr.reannounce(), conveys)).toEqual([]);
}

// Nothing-changed is not something a poll can wait for, so give the dispatch the room a real toggle gets.
async function settle() {
	await new Promise((resolve) => setTimeout(resolve, 150));
}

test.skip('entering the list conveys the group and its name before the select-all', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'group' }), {
		role: 'group',
		name: 'Sandwich Condiments',
	});
});

test.skip('reading an untouched select-all conveys the checkbox role, its name and that it is not checked', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'checkbox', name: 'All condiments' }), {
		role: 'checkbox',
		name: 'All condiments',
		state: ['notChecked'],
	});
});

// No position-in-set fact: a checkbox group is not a set the way a radio group is, and that is the audible difference between the families.
test('each item conveys the checkbox role, its own name and that it is not checked', async () => {
	await open(Basic);
	for (const name of ['Lettuce', 'Tomato', 'Mustard']) {
		expectConveys(await readUntil(sr, { role: 'checkbox', name }), {
			role: 'checkbox',
			name,
			state: ['notChecked'],
		});
	}
});

// A select-all never cycles into mixed: its mixed state is computed from the items rather than chosen.
test.skip('pressing space on an untouched select-all announces it as checked, never as partially checked', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'checkbox', name: 'All condiments' });
	await sr.press(sr.keys.space);
	await expectAnnouncesAfterChange({
		role: 'checkbox',
		name: 'All condiments',
		state: ['checked'],
	});
	expect(missingFacts(sr, await sr.lastSpokenPhrase(), { state: ['partiallyChecked'] })).not.toEqual(
		[],
	);
});

test('pressing space on an item announces that item as checked', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'checkbox', name: 'Lettuce' });
	await sr.press(sr.keys.space);
	await expectAnnouncesAfterChange({
		role: 'checkbox',
		name: 'Lettuce',
		state: ['checked'],
	});
});

// A known weakness: the parent's state changes with no announcement. It must not be solved with aria-live on the select-all, which would speak on every item toggle.
test('checking one item announces that item only, and says nothing about the select-all', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'checkbox', name: 'Lettuce' });
	await sr.press(sr.keys.space);
	await settle();
	const spoken = await sr.lastSpokenPhrase();
	expect(spoken).not.toContain('All condiments');
});

test('an item nobody may change conveys that it is disabled and space leaves it alone', async () => {
	await open(UnavailableOptions);
	const name = 'Not available on your plan';
	expectConveys(await readUntil(sr, { role: 'checkbox', name }), {
		role: 'checkbox',
		name,
		state: ['notChecked', 'disabled'],
	});
	await sr.press(sr.keys.space);
	await settle();
	expectConveys(await sr.reannounce(), {
		role: 'checkbox',
		name,
		state: ['notChecked', 'disabled'],
	});
});

// Expected red: a composed family's root cannot be seeded from the enclosing family's instance, so the group renders as if it were empty.
test.fails('reading a partly ticked select-all conveys it as partially checked', async () => {
	await open(Partial);
	expectConveys(await readUntil(sr, { role: 'checkbox', name: 'All condiments' }), {
		role: 'checkbox',
		name: 'All condiments',
		state: ['partiallyChecked'],
	});
});

test.skip('pressing space on a partly ticked select-all announces it as checked', async () => {
	await open(Partial);
	await readUntil(sr, { role: 'checkbox', name: 'All condiments' });
	await sr.press(sr.keys.space);
	await expectAnnouncesAfterChange({
		role: 'checkbox',
		name: 'All condiments',
		state: ['checked'],
	});
});

test('an item the group starts with ticked is conveyed as checked', async () => {
	await open(Partial);
	expectConveys(await readUntil(sr, { role: 'checkbox', name: 'Tomato' }), {
		role: 'checkbox',
		name: 'Tomato',
		state: ['checked'],
	});
});
