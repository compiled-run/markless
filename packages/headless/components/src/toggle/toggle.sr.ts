import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import Invalid from './scenarios/invalid.tsrx';
import SettingsList from './scenarios/settings-list.tsrx';
import UnavailableOptions from './scenarios/unavailable-options.tsrx';
import WithHelp from './scenarios/with-help.tsrx';

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

// A flip reaches the DOM after the dispatch it woke returns, so the reader is asked again until the new state is what it reads.
async function expectAnnouncesAfterChange(conveys: Conveys) {
	await expect.poll(async () => missingFacts(sr, await sr.reannounce(), conveys)).toEqual([]);
}

// Nothing-changed is not something a poll can wait for, so give the dispatch the room a real flip gets.
async function settle() {
	await new Promise((resolve) => setTimeout(resolve, 150));
}

test('reading the starter conveys the switch role, its name and that it is off', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'switch' }), {
		role: 'switch',
		name: 'Enable notifications',
		state: ['notChecked'],
	});
});

test('two switches on one page each convey their own name and their own state', async () => {
	await open(SettingsList);
	expectConveys(await readUntil(sr, { role: 'switch', name: 'Enable notifications' }), {
		role: 'switch',
		name: 'Enable notifications',
		state: ['notChecked'],
	});
	expectConveys(await readUntil(sr, { role: 'switch', name: 'Weekly digest' }), {
		role: 'switch',
		name: 'Weekly digest',
		state: ['checked'],
	});
});

test('pressing space on a switch that is off announces it as on', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'switch' });
	await sr.press(sr.keys.space);
	await expectAnnouncesAfterChange({
		role: 'switch',
		name: 'Enable notifications',
		state: ['checked'],
	});
});

test('pressing space on a switch that is on announces it as off', async () => {
	await open(SettingsList);
	await readUntil(sr, { role: 'switch', name: 'Weekly digest' });
	await sr.press(sr.keys.space);
	await expectAnnouncesAfterChange({
		role: 'switch',
		name: 'Weekly digest',
		state: ['notChecked'],
	});
});

test('a switch nobody may change conveys that it is disabled and space leaves it alone', async () => {
	await open(UnavailableOptions);
	const name = 'Not available on your plan';
	expectConveys(await readUntil(sr, { role: 'switch', name }), {
		role: 'switch',
		name,
		state: ['notChecked', 'disabled'],
	});
	await sr.press(sr.keys.space);
	await settle();
	expectConveys(await sr.reannounce(), {
		role: 'switch',
		name,
		state: ['notChecked', 'disabled'],
	});
});

test('a switch that is on and locked conveys both facts at once', async () => {
	await open(UnavailableOptions);
	expectConveys(await readUntil(sr, { role: 'switch', name: 'Always on for your plan' }), {
		role: 'switch',
		name: 'Always on for your plan',
		state: ['checked', 'disabled'],
	});
});

test('a mounted error part makes the reader convey the switch as invalid', async () => {
	await open(Invalid);
	expectConveys(await readUntil(sr, { role: 'switch' }), {
		role: 'switch',
		name: 'Enable notifications',
		state: ['invalid'],
	});
});

test('a switch with only help text under it is never conveyed as invalid', async () => {
	await open(WithHelp);
	const announcement = await readUntil(sr, { role: 'switch' });
	expectConveys(announcement, {
		role: 'switch',
		name: 'Enable notifications',
		state: ['notChecked'],
	});
	// This reader speaks "not invalid" as its own fact, so the absence needs its own assertion.
	expect(missingFacts(sr, announcement, { state: ['invalid'] })).not.toEqual([]);
	await readUntil(sr, { name: '(Receive notifications about important updates)' });
});

// The description binds the handle the trigger names through aria-describedby, so it is part of the switch rather than a separate item down the page.
test('the help text under a switch is conveyed with the switch itself', async () => {
	await open(WithHelp);
	await readUntil(sr, { role: 'switch' });
	expect(
		missingFacts(sr, await sr.lastSpokenPhrase(), {
			name: '(Receive notifications about important updates)',
		}),
	).toEqual([]);
});
