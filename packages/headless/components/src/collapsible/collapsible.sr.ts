import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import Unavailable from './scenarios/unavailable.tsrx';

// Rows follow the w3c/aria-at disclosure plan and assert the facts an announcement
// must convey - role, name, state - never a reader product's wording. The whole
// pattern is one assertion: `aria-expanded` on the trigger, which aria-at makes
// `stateChangeToExpanded` at priority 1, with no live region anywhere in the plan.
// `sr` is the only line that picks a reader, so the same expectations run against
// NVDA and VoiceOver once those drivers land.
//
// The plan has no test for a trigger nobody may operate, so that row is ours.
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

/**
 * The panel reaches the DOM only after the dispatch the trigger woke returns, so the
 * reader is asked again until it reads the new state.
 *
 * It walks forward rather than re-reading in place: opening the panel grows the
 * reading tree under the cursor, so stepping off the item and back onto it lands on
 * the revealed content instead of on the trigger. The walk wraps around a tree this
 * small, so it reaches the trigger either way and never reads a stale item.
 */
async function expectAnnouncesAfterChange(conveys: Conveys) {
	await expect
		.poll(async () => {
			await sr.next();
			return missingFacts(sr, await sr.lastSpokenPhrase(), conveys);
		})
		.toEqual([]);
}

// Nothing changed is not something a poll can wait for: give the dispatch the
// same room a real activation gets, then read the item once.
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

// The other half of a closed disclosure: the panel is hidden, so nothing in it is
// reachable. A reader that can walk into hidden content is the failure this row
// catches, and it is why `hidden` rather than `display:none` on a wrapper matters.
test('the text inside a closed panel is not reachable', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button' });
	const walked: string[] = [];
	for (let step = 0; step < 6; step++) {
		await sr.next();
		walked.push(await sr.lastSpokenPhrase());
	}
	expect(walked.join(' | ')).not.toContain('A button that shows and hides the content below it.');
});

// aria-at's `stateChangeToExpanded`, priority 1. The APG gives the disclosure
// control Enter and Space; this is the Enter half.
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

// The panel a person opened has to be reachable, or the state change announced
// nothing useful.
test('the text inside an opened panel becomes reachable', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button' });
	await sr.press(sr.keys.enter);
	await settle();
	await readUntil(sr, { name: 'A button that shows and hides the content below it.' });
});

// Ours, not aria-at's: a trigger nobody may operate has to say so rather than
// simply not respond, and its state stays what it was.
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

// A separate row from Enter rather than a loop over both keys: the two go through
// different halves of a native button's activation, and one can break alone.
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
