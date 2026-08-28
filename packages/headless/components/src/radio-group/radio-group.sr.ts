import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import { Basic } from './scenarios/basic.tsrx';
import { Prefilled } from './scenarios/prefilled.tsrx';
import { UnavailableOptions } from './scenarios/unavailable-options.tsrx';

// Rows assert the facts an announcement must convey - role, name, state - never a reader product's wording.
const sr = virtualDriver;

// One scenario per test: field ids are minted per container, so two live scenarios give two inputs the same id and every `<label for>` after the first resolves wrong.
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

// An arrow moves a roving focus, which this reader speaks by itself a task-queue turn later: a re-read started inside that window steps the cursor one item past the option, onto the label text, and every later re-read repeats the offset.
async function expectAnnouncesFocused(conveys: Conveys) {
	await expect.poll(async () => missingFacts(sr, await sr.settleOnFocus(), conveys)).toEqual([]);
}

test('entering the group conveys the radiogroup role and the group name', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'radiogroup' }), {
		role: 'radiogroup',
		name: 'Billing Period',
	});
});

test('each option conveys the radio role, its own name and that it is not checked', async () => {
	await open(Basic);
	for (const name of ['Monthly', 'Annual', 'Lifetime']) {
		expectConveys(await readUntil(sr, { role: 'radio', name }), {
			role: 'radio',
			name,
			state: ['notChecked'],
		});
	}
});

test('a group that starts with a choice conveys exactly that option as checked', async () => {
	await open(Prefilled);
	expectConveys(await readUntil(sr, { role: 'radio', name: 'Monthly' }), {
		role: 'radio',
		name: 'Monthly',
		state: ['notChecked'],
	});
	expectConveys(await readUntil(sr, { role: 'radio', name: 'Annual' }), {
		role: 'radio',
		name: 'Annual',
		state: ['checked'],
	});
	expectConveys(await readUntil(sr, { role: 'radio', name: 'Lifetime' }), {
		role: 'radio',
		name: 'Lifetime',
		state: ['notChecked'],
	});
});

// The half this reader can prove; whether the arrow also chose the option is the row below.
test('arrowing to the next option moves the reader onto that option', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'radio', name: 'Monthly' });
	await sr.press(sr.keys.arrowDown);
	await expectAnnouncesFocused({ role: 'radio', name: 'Annual' });
});

// Expected red against this reader, not the family: it reads the `checked` content attribute, which is the default state, while the family sets the current-state property.
test.fails('arrowing to the next option announces that option as checked', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'radio', name: 'Monthly' });
	await sr.press(sr.keys.arrowDown);
	await expectAnnouncesFocused({
		role: 'radio',
		name: 'Annual',
		state: ['checked'],
	});
});

test('an option nobody may choose conveys that it is disabled', async () => {
	await open(UnavailableOptions);
	expectConveys(await readUntil(sr, { role: 'radio', name: 'Lifetime' }), {
		role: 'radio',
		name: 'Lifetime',
		state: ['notChecked', 'disabled'],
	});
});

// The group's `disabled` reaches the group's own aria and every option's input, so the reader conveys it on both.
test('a group nobody may touch conveys disabled on the group and on its options', async () => {
	await open(UnavailableOptions);
	expectConveys(await readUntil(sr, { role: 'radiogroup', name: 'Support Plan' }), {
		role: 'radiogroup',
		name: 'Support Plan',
		state: ['disabled'],
	});
	expectConveys(await readUntil(sr, { role: 'radio', name: 'Basic' }), {
		role: 'radio',
		name: 'Basic',
		state: ['checked', 'disabled'],
	});
});
