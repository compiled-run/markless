import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import Faq from './scenarios/faq.tsrx';

// What a screen reader says about the accordion family. Each row names the facts
// an announcement has to convey - role, accessible name, state - and never a
// reader product's wording. `sr` is the only line that picks a reader, so the
// same expectations run against NVDA and VoiceOver once those drivers land.
//
// Coverage, recorded honestly: w3c/aria-at has no accordion plan. Every
// expectation here is derived from the APG accordion pattern, and the
// open/closed half of it is the same `aria-expanded` assertion the disclosure
// plan makes - the one collapsible already runs - because an accordion section
// IS a disclosure with siblings.
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
 * The panel reaches the DOM only after the dispatch the trigger woke returns, so
 * the reader is asked again until it reads the new state.
 *
 * It walks forward rather than re-reading in place: opening a section grows the
 * reading tree under the cursor, so stepping off the item and back onto it lands
 * on the revealed content instead of on the trigger. The walk wraps around a
 * tree this small, so it reaches the trigger either way.
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
		name: 'When does my order ship?',
		state: ['notExpanded'],
	});
});

// PINNED, and the pin is about the reader rather than about our markup.
//
// A closed panel here carries `hidden="until-found"`, and the browser's own UA
// rule gives that `content-visibility: hidden`. Chromium really applies it:
// `accordion.browser.ts` measures the computed `content-visibility` and a zero
// height on the very same element, so a real accessibility tree does not contain
// this text. This reader is a screen reader written in JavaScript and models
// `hidden` and `display:none` but not `content-visibility`, so it walks straight
// into the panel and speaks it.
//
// The row stays, red, for two reasons: it turns green the day guidepup models
// content-visibility, and how a REAL reader's virtual cursor treats an
// until-found section is a genuinely open question (the same one
// `notes/research-tree.md` raises for JAWS). Collapsible's equivalent row passes
// because collapsible still ships plain `hidden`.
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

// A separate row from Enter rather than a loop over both keys: the two go
// through different halves of a native button's activation, and one can break
// alone.
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

// The panel a person opened has to be reachable, and it has to arrive as a named
// region - which is the whole reason `accordion.itemlabel` mints an id at all.
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

// The APG's roving walk. The reader follows DOM focus, so this row proves the
// arrow moved focus to the next section AND that the reader lands there.
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

// Ours: a section nobody may open has to say so rather than simply not respond,
// and its state stays what it was.
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
