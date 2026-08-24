import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import ManualActivation from './scenarios/manual-activation.tsrx';
import Vertical from './scenarios/vertical.tsrx';

// What a screen reader says about the tabs family, asserted the way the w3c/aria-at
// `tests/apg/tabs-automatic-activation` and `tests/apg/tabs-manual-activation`
// plans assert it: each step names the facts the announcement has to convey -
// role, accessible name, state - and never a product's wording. The sequence
// letters below are the ones those two plans use. `sr` is the only line that picks a reader,
// so the same expectations run against NVDA and VoiceOver once those drivers land.
//
// aria-at coverage, recorded honestly: both plans are about a tab list a person
// tabs into and arrows through. Neither has a test for a vertical tab list, and
// neither has one for a tab nobody may open, so those rows are ours.
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
 * A tab change reaches the DOM after the dispatch it woke returns, so the reader
 * is asked again until the new state is what it reads.
 *
 * It walks forward rather than re-reading the item in place: showing a tab
 * reshapes the reading tree - one panel appears and another goes away - so
 * stepping off the item and back onto it can land somewhere else entirely. The
 * walk wraps around a tree this small, so it reaches the tab either way.
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
// same room a real tab change gets, then walk to the item and read it.
async function settle() {
	await new Promise((resolve) => setTimeout(resolve, 200));
}

// Sequence A, the tab-list step: aria-at asserts the tab list's role at priority 3
// before any tab's own facts.
test('entering the widget conveys the tablist role', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'tablist' }), { role: 'tablist' });
});

// Sequence A, the tab step: the selected tab conveys role, name and that it is
// selected, and aria-at asserts the selected state at priority 1.
test('the showing tab conveys the tab role, its name and that it is selected', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'tab', name: 'Overview' }), {
		role: 'tab',
		name: 'Overview',
		state: ['selected'],
	});
});

// Sequence B: a tab that is not showing must not be conveyed as selected. Asserted
// as an absence rather than as a word, because "not selected" is a state only some
// readers speak and the seam holds no word for a fact a reader states by silence.
test('a tab that is not showing is never conveyed as selected', async () => {
	await open(Basic);
	const announcement = await readUntil(sr, { role: 'tab', name: 'Usage' });
	expectConveys(announcement, { role: 'tab', name: 'Usage' });
	expect(missingFacts(sr, announcement, { state: ['selected'] })).not.toEqual([]);
});

// Sequence C, automatic activation: one arrow moves focus and shows the tab, and
// aria-at asserts the state change at priority 1 on that single keypress.
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

// Sequence D, manual activation: the same keypress moves focus and shows nothing.
// This is the audible difference between the two plans, and the row that catches a
// selectOnFocus regression.
test('with manual activation an arrow moves to a tab that is still not selected', async () => {
	await open(ManualActivation);
	await readUntil(sr, { role: 'tab', name: 'Daily' });
	await sr.press(sr.keys.arrowRight);
	await settle();
	const announcement = await readUntil(sr, { role: 'tab', name: 'Weekly' });
	expect(missingFacts(sr, announcement, { state: ['selected'] })).not.toEqual([]);
});

// Sequence F, the panel step: the panel is reachable and conveys the tabpanel
// role, and the text inside it is read.
test('the showing panel conveys the tabpanel role and its text is reachable', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'tabpanel' }), { role: 'tabpanel' });
	await readUntil(sr, { name: 'Everything that happened this month.' });
});

// Ours, not aria-at's: a vertical tab list, holding a tab nobody may open.
// `aria-orientation` is the fact QDS never emitted - a reader that cannot tell a
// vertical list from a horizontal one tells a person the wrong arrow keys work -
// and a locked tab has to say it is unavailable rather than simply not respond.
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

// Recorded red, not asserted green. Sequence F step 3: aria-at gives the panel's
// own accessible name priority 1, taken from `aria-labelledby` pointing at the tab
// that shows it. `tabs.content` wires no such reference, so a reader reaches an
// unnamed region and reads its text with no idea which tab it belongs to.
//
// Still red after the 2026-08-22 attempt, and now for a measured reason rather
// than an assumed one. The showing-pair shape - the selected trigger putting its
// text in a `.
<span el={tabs.showingTabEl}>` inside an `@if`, every panel naming
// that one handle - is `MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED`, because the arm
// holds an attribute binding and `selected` flips. Binding the handle on the
// button unconditionally compiles and is worse: one widget mints one id, so every
// trigger renders the same one. Whoever lands
// a value-keyed shared() instance deletes the `.fails`.
test.fails('the showing panel is conveyed with the name of the tab that shows it', async () => {
	await open(Basic);
	const announcement = await readUntil(sr, { role: 'tabpanel' });
	expect(missingFacts(sr, announcement, { role: 'tabpanel', name: 'Overview' })).toEqual([]);
});
