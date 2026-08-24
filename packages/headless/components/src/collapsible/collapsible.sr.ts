import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import Unavailable from './scenarios/unavailable.tsrx';
import WithoutFindInPage from './scenarios/without-find-in-page.tsrx';

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

/** Walks forward rather than re-reading in place: opening the panel grows the tree under the cursor, so a re-read lands on the revealed content. */
async function expectAnnouncesAfterChange(conveys: Conveys) {
	await expect
		.poll(async () => {
			await sr.next();
			return missingFacts(sr, await sr.lastSpokenPhrase(), conveys);
		})
		.toEqual([]);
}

// Nothing-changed is not something a poll can wait for, so give the dispatch the room a real activation gets.
async function settle() {
	await new Promise((resolve) => setTimeout(resolve, 150));
}

test('reading the starter conveys the button role, its name and that it is not expanded', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'button' }), {
		role: 'button',
		name: 'What is a collapsible?',
		state: ['notExpanded'],
	});
});

// Asserted on the opted-out-of-find-in-page scenario, where the panel is plain `hidden`: this reader does not model hidden="until-found", which is the default.
test('the text inside a closed panel is not reachable', async () => {
	await open(WithoutFindInPage);
	await readUntil(sr, { role: 'button' });
	const walked: string[] = [];
	for (let step = 0; step < 6; step++) {
		await sr.next();
		walked.push(await sr.lastSpokenPhrase());
	}
	expect(walked.join(' | ')).not.toContain('A button that shows and hides the content below it.');
});

test('pressing enter announces the trigger as expanded', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button' });
	await sr.press(sr.keys.enter);
	await expectAnnouncesAfterChange({
		role: 'button',
		name: 'What is a collapsible?',
		state: ['expanded'],
	});
});

test('the text inside an opened panel becomes reachable', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button' });
	await sr.press(sr.keys.enter);
	await settle();
	await readUntil(sr, { name: 'A button that shows and hides the content below it.' });
});

test('a section nobody may change conveys disabled, and its state does not move', async () => {
	await open(Unavailable);
	expectConveys(await readUntil(sr, { role: 'button', name: 'Billing history' }), {
		role: 'button',
		name: 'Billing history',
		state: ['disabled', 'notExpanded'],
	});
	await sr.press(sr.keys.enter);
	await settle();
	expectConveys(await sr.reannounce(), {
		role: 'button',
		name: 'Billing history',
		state: ['disabled', 'notExpanded'],
	});
});

test('a section locked open still conveys that it is expanded', async () => {
	await open(Unavailable);
	expectConveys(await readUntil(sr, { role: 'button', name: 'Account owner' }), {
		role: 'button',
		name: 'Account owner',
		state: ['disabled', 'expanded'],
	});
	await readUntil(sr, { name: 'Only the workspace owner can change this.' });
});

test('pressing space announces the trigger as expanded', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button' });
	await sr.press(sr.keys.space);
	await expectAnnouncesAfterChange({
		role: 'button',
		name: 'What is a collapsible?',
		state: ['expanded'],
	});
});
