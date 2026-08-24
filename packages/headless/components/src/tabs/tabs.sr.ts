import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import ManualActivation from './scenarios/manual-activation.tsrx';
import Vertical from './scenarios/vertical.tsrx';

// Rows assert the facts an announcement must convey - role, name, state - never a reader product's wording.
const sr = virtualDriver;

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

/** Walks forward rather than re-reading in place: showing a tab reshapes the reading tree, so a re-read can land somewhere else entirely. */
async function expectAnnouncesAfterChange(conveys: Conveys) {
	await expect
		.poll(async () => {
			await sr.next();
			return missingFacts(sr, await sr.lastSpokenPhrase(), conveys);
		})
		.toEqual([]);
}

// Nothing-changed is not something a poll can wait for, so give the dispatch the room a real tab change gets.
async function settle() {
	await new Promise((resolve) => setTimeout(resolve, 200));
}

test('entering the widget conveys the tablist role', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'tablist' }), { role: 'tablist' });
});

test('the showing tab conveys the tab role, its name and that it is selected', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'tab', name: 'Overview' }), {
		role: 'tab',
		name: 'Overview',
		state: ['selected'],
	});
});

// Asserted as an absence: "not selected" is a state only some readers speak, so there is no word to assert.
test('a tab that is not showing is never conveyed as selected', async () => {
	await open(Basic);
	const announcement = await readUntil(sr, { role: 'tab', name: 'Usage' });
	expectConveys(announcement, { role: 'tab', name: 'Usage' });
	expect(missingFacts(sr, announcement, { state: ['selected'] })).not.toEqual([]);
});

test('arrowing to the next tab announces that tab as selected', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'tab', name: 'Overview' });
	await sr.press(sr.keys.arrowRight);
	await expectAnnouncesAfterChange({
		role: 'tab',
		name: 'Usage',
		state: ['selected'],
	});
});

// The row that catches a selectOnFocus regression: the same keypress must move focus and show nothing.
test('with manual activation an arrow moves to a tab that is still not selected', async () => {
	await open(ManualActivation);
	await readUntil(sr, { role: 'tab', name: 'Daily' });
	await sr.press(sr.keys.arrowRight);
	await settle();
	const announcement = await readUntil(sr, { role: 'tab', name: 'Weekly' });
	expect(missingFacts(sr, announcement, { state: ['selected'] })).not.toEqual([]);
});

test('the showing panel conveys the tabpanel role and its text is reachable', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'tabpanel' }), { role: 'tabpanel' });
	await readUntil(sr, { name: 'Everything that happened this month.' });
});

// A reader that cannot tell a vertical list from a horizontal one tells a person the wrong arrow keys work.
test('a vertical tab list conveys its showing tab and its locked tab', async () => {
	await open(Vertical);
	await readUntil(sr, { role: 'tablist' });
	expectConveys(await readUntil(sr, { role: 'tab', name: 'Inbox' }), {
		role: 'tab',
		name: 'Inbox',
		state: ['selected'],
	});
	expectConveys(await readUntil(sr, { role: 'tab', name: 'Drafts' }), {
		role: 'tab',
		name: 'Drafts',
		state: ['disabled'],
	});
});

// Expected red: the panel wires no aria-labelledby to its tab, so a reader reaches an unnamed region. The handle shape that would fix it needs a value-keyed shared instance.
test.fails('the showing panel is conveyed with the name of the tab that shows it', async () => {
	await open(Basic);
	const announcement = await readUntil(sr, { role: 'tabpanel' });
	expect(missingFacts(sr, announcement, { role: 'tabpanel', name: 'Overview' })).toEqual([]);
});
