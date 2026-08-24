import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import Faq from './scenarios/faq.tsrx';

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

/** Walks forward rather than re-reading in place: opening a section grows the tree under the cursor, so a re-read lands on the revealed content. */
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
		name: 'When does my order ship?',
		state: ['notExpanded'],
	});
});

// Expected red against this reader, not the markup: a closed panel is hidden="until-found", and the reader models `hidden` and display:none but not content-visibility.
test.fails('the text inside a closed panel is not reachable', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button' });
	const walked: string[] = [];
	for (let step = 0; step < 8; step++) {
		await sr.next();
		walked.push(await sr.lastSpokenPhrase());
	}
	expect(walked.join(' | ')).not.toContain('Orders leave the warehouse');
});

test('pressing enter announces the trigger as expanded', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button' });
	await sr.press(sr.keys.enter);
	await expectAnnouncesAfterChange({
		role: 'button',
		name: 'When does my order ship?',
		state: ['expanded'],
	});
});

test('pressing space announces the trigger as expanded', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button' });
	await sr.press(sr.keys.space);
	await expectAnnouncesAfterChange({
		role: 'button',
		name: 'When does my order ship?',
		state: ['expanded'],
	});
});

test('an opened panel is a region named by its own heading, and its text is reachable', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button' });
	await sr.press(sr.keys.enter);
	await settle();
	expectConveys(await readUntil(sr, { role: 'region' }), {
		role: 'region',
		name: 'When does my order ship?',
	});
	await readUntil(sr, { name: 'Orders leave the warehouse within two working days.' });
});

test('arrowing down moves the reader to the next section trigger', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button', name: 'When does my order ship?' });
	await sr.press(sr.keys.arrowDown);
	expectConveys(await sr.settleOnFocus(), {
		role: 'button',
		name: 'How do I return something?',
		state: ['notExpanded'],
	});
});

test('the section the value names is announced as expanded from the first read', async () => {
	await open(Faq);
	expectConveys(await readUntil(sr, { role: 'button', name: 'What are the quiet hours?' }), {
		role: 'button',
		name: 'What are the quiet hours?',
		state: ['expanded'],
	});
	await readUntil(sr, { name: 'No power tools before eight in the morning.' });
});

test('a section nobody may open conveys disabled, and its state does not move', async () => {
	await open(Faq);
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
