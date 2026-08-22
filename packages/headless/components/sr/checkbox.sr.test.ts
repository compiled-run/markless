import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from './driver.ts';
import { virtualDriver } from './virtual-driver.ts';
import Basic from '../src/checkbox/scenarios/basic.tsrx';
import Invalid from '../src/checkbox/scenarios/invalid.tsrx';
import PartialSelection from '../src/checkbox/scenarios/partial-selection.tsrx';
import SettingsList from '../src/checkbox/scenarios/settings-list.tsrx';
import UnavailableOptions from '../src/checkbox/scenarios/unavailable-options.tsrx';
import WithHelp from '../src/checkbox/scenarios/with-help.tsrx';

// What a screen reader says about the checkbox family, asserted the way the
// w3c/aria-at checkbox (tri-state) plan asserts it: each step names the facts
// the announcement has to convey - role, accessible name, state - and never a
// product's wording. `sr` is the only line that picks a reader, so the same
// expectations run against NVDA and VoiceOver once those drivers land.
const sr = virtualDriver;

// One scenario per test: the trigger id is minted per container, so two
// scenarios alive in one document give two elements the same id and every
// `<label for>` after the first resolves to the wrong trigger.
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

// A toggle reaches the DOM after the dispatch it woke returns, so the reader is
// asked again until the new state is what it reads.
async function expectAnnouncesAfterChange(conveys: Conveys) {
	await expect.poll(async () => missingFacts(sr, await sr.reannounce(), conveys)).toEqual([]);
}

// Nothing changed is not something a poll can wait for: give the dispatch the
// same room a real toggle gets, then read the item once.
async function settle() {
	await new Promise((resolve) => setTimeout(resolve, 150));
}

test('reading the starter conveys the checkbox role, its name and that it is not checked', async () => {
	await open(Basic);
	const announcement = await readUntil(sr, { role: 'checkbox' });
	expectConveys(announcement, {
		role: 'checkbox',
		name: 'Checkbox Label',
		state: ['notChecked'],
	});
});

test('a list of options conveys each of the three checkbox states', async () => {
	await open(SettingsList);
	expectConveys(await readUntil(sr, { role: 'checkbox', name: 'Product emails' }), {
		role: 'checkbox',
		name: 'Product emails',
		state: ['notChecked'],
	});
	expectConveys(await readUntil(sr, { role: 'checkbox', name: 'Weekly digest' }), {
		role: 'checkbox',
		name: 'Weekly digest',
		state: ['checked'],
	});
	expectConveys(await readUntil(sr, { role: 'checkbox', name: 'All alerts' }), {
		role: 'checkbox',
		name: 'All alerts',
		state: ['partiallyChecked'],
	});
});

test('pressing space on a box that is not checked announces it as checked', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'checkbox' });
	await sr.press(sr.keys.space);
	await expectAnnouncesAfterChange({
		role: 'checkbox',
		name: 'Checkbox Label',
		state: ['checked'],
	});
});

test('pressing space on a checked box announces it as not checked', async () => {
	await open(SettingsList);
	await readUntil(sr, { role: 'checkbox', name: 'Weekly digest' });
	await sr.press(sr.keys.space);
	await expectAnnouncesAfterChange({
		role: 'checkbox',
		name: 'Weekly digest',
		state: ['notChecked'],
	});
});

test('pressing space on a partly checked box announces it as checked', async () => {
	await open(PartialSelection);
	await readUntil(sr, { role: 'checkbox', name: 'Select all' });
	await sr.press(sr.keys.space);
	await expectAnnouncesAfterChange({
		role: 'checkbox',
		name: 'Select all',
		state: ['checked'],
	});
});

test('an option nobody may change conveys that it is disabled and space leaves it alone', async () => {
	await open(UnavailableOptions);
	const announcement = await readUntil(sr, { role: 'checkbox', name: 'Not available on your plan' });
	expectConveys(announcement, {
		role: 'checkbox',
		name: 'Not available on your plan',
		state: ['notChecked', 'disabled'],
	});
	await sr.press(sr.keys.space);
	await settle();
	expectConveys(await sr.reannounce(), {
		role: 'checkbox',
		name: 'Not available on your plan',
		state: ['notChecked', 'disabled'],
	});
});

test('a mounted error part makes the reader convey the box as invalid', async () => {
	await open(Invalid);
	expectConveys(await readUntil(sr, { role: 'checkbox', name: 'Accept Terms' }), {
		role: 'checkbox',
		name: 'Accept Terms',
		state: ['invalid'],
	});
});

test('a box with only help text under it is never conveyed as invalid', async () => {
	await open(WithHelp);
	const announcement = await readUntil(sr, { role: 'checkbox' });
	expectConveys(announcement, {
		role: 'checkbox',
		name: 'Subscribe to newsletter',
		state: ['notChecked'],
	});
	// This reader speaks "not invalid" as its own fact, so the assertion above
	// cannot be read as "invalid is absent"; that is what this line proves.
	expect(missingFacts(sr, announcement, { state: ['invalid'] })).not.toEqual([]);
	// The help text is reachable, just not attached to the box - see below.
	await readUntil(sr, { name: "We'll send you updates about new features" });
});

// Recorded red, not asserted green. aria-at's checkbox plan expects the
// description to be conveyed with the box; `<checkbox.description>` writes a
// plain div and wires no aria-describedby, so the reader announces it only as a
// separate item further down the page. This turns red the day that is wired,
// and whoever wires it deletes the `.fails`.
test.fails('the help text under a box is conveyed with the box itself', async () => {
	await open(WithHelp);
	expectConveys(await readUntil(sr, { role: 'checkbox' }), {
		role: 'checkbox',
		name: 'Subscribe to newsletter',
		state: ['notChecked'],
		// aria-at asserts the description is part of what the box conveys.
	});
	expect(
		missingFacts(sr, await sr.lastSpokenPhrase(), {
			name: "We'll send you updates about new features",
		}),
	).toEqual([]);
});

// Recorded red, not asserted green. The authoring practices give a checkbox one
// activation key, space; the trigger calls preventDefault() on Enter, but the
// component source already records that the request lands after dispatch
// returns, so Enter still toggles. Red the day that ordering is fixed.
test.fails('pressing enter leaves a checkbox alone', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'checkbox' });
	await sr.press(sr.keys.enter);
	await settle();
	expectConveys(await sr.reannounce(), {
		role: 'checkbox',
		name: 'Checkbox Label',
		state: ['notChecked'],
	});
});
