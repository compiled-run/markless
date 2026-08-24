import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import University from './scenarios/university.tsrx';

// What a screen reader says about the navbar family, asserted the way the
// w3c/aria-at `disclosure-navigation` plan asserts it: each step names the facts
// the announcement has to convey - role, accessible name, state - and never a
// product's wording. `sr` is the only line that picks a reader, so the same
// expectations run against NVDA and VoiceOver once those drivers land.
//
// Unlike most families here, these rows are BACKED BY AN ARIA-AT PLAN rather
// than derived from the authoring practices alone. The scenario is that plan's
// own fixture rebuilt on this family - a "Mythical University" navigation with
// three buttons - so the sequences below are the plan's sequences.
//
// aria-at coverage, recorded honestly:
//   * `listBoundary`, priority 3, wants the `<ul>`/`<li>` this family does not
//     render. The QDS reference dropped the list deliberately and the measured
//     cost is that one weakest-tier assertion; it has no row here because there
//     is nothing to assert.
//   * `nameMythicalUniversity` is priority 1 and the family writes NO default
//     name, so the scenario supplies one. A navbar with no `aria-label` fails
//     that assertion, which is exactly why the research recommends a dev-mode
//     diagnostic rather than an invented default.
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
 * The panel reaches the DOM after the dispatch the key woke returns, so the
 * reader is asked again until the new state is what it reads.
 *
 * It walks forward rather than re-reading the item in place, for the reason the
 * collapsible lane gives: opening a dropdown GROWS the reading tree under the
 * cursor, so stepping off the button and back onto it lands on the newly
 * revealed links instead of on the button. The walk wraps, so it reaches the
 * button either way and never reads a stale item.
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

// Sequence A - entering the navigation. aria-at's `nameMythicalUniversity` and
// `roleNavigationLandmark`, both priority 1.
test('entering the navbar conveys the navigation landmark and its name', async () => {
	await open(University);
	expectConveys(await readUntil(sr, { role: 'navigation' }), {
		role: 'navigation',
		name: 'Mythical University',
	});
});

// Sequence A, continued: `roleButton`, `nameAbout` and `stateCollapsed`, all
// priority 1. The state is the whole point of the pattern - a button that shows
// a panel has to say whether the panel is showing.
test('reading the first entry conveys the button role, its name and that it is collapsed', async () => {
	await open(University);
	expectConveys(await readUntil(sr, { role: 'button', name: 'About' }), {
		role: 'button',
		name: 'About',
		state: ['notExpanded'],
	});
});

test('the other two entries convey their own names as collapsed buttons', async () => {
	await open(University);
	expectConveys(await readUntil(sr, { role: 'button', name: 'Academics' }), {
		role: 'button',
		name: 'Academics',
		state: ['notExpanded'],
	});
	expectConveys(await readUntil(sr, { role: 'button', name: 'Admissions' }), {
		role: 'button',
		name: 'Admissions',
		state: ['notExpanded'],
	});
});

// The other half of a closed disclosure: the dropdown is hidden, so nothing in
// it is reachable. A reader that can walk into hidden content is the failure
// this row catches, and it is why `hidden` rather than a styled-away wrapper
// matters.
test('the links inside a closed dropdown are not reachable', async () => {
	await open(University);
	await readUntil(sr, { role: 'button', name: 'About' });
	const walked: string[] = [];
	for (let step = 0; step < 8; step++) {
		await sr.next();
		walked.push(await sr.lastSpokenPhrase());
	}
	expect(walked.join(' | ')).not.toContain('Overview');
	expect(walked.join(' | ')).not.toContain('Campus Tours');
});

// The pattern's defining constraint, asserted as an absence because no reader
// vocabulary can name "the thing that is not there". A navbar built as a menubar
// puts a reader into application mode and promises desktop-menu behaviour site
// navigation does not have.
test('nothing in the navbar is announced as a menu', async () => {
	await open(University);
	await readUntil(sr, { role: 'navigation' });
	const walked: string[] = [];
	for (let step = 0; step < 12; step++) {
		await sr.next();
		walked.push(await sr.lastSpokenPhrase());
	}
	const transcript = walked.join(' | ');
	expect(transcript).not.toContain('menubar');
	expect(transcript).not.toContain('menuitem');
});

// Sequence B - aria-at's `stateChangeToExpanded`, priority 1. The CHANGE is its
// own assertion, separate from the state: a reader that only re-reads the button
// on the next focus fails this row.
test('pressing enter on an entry announces it as expanded', async () => {
	await open(University);
	await readUntil(sr, { role: 'button', name: 'About' });
	await sr.press(sr.keys.enter);
	await expectAnnouncesAfterChange({
		role: 'button',
		name: 'About',
		state: ['expanded'],
	});
});

// Sequence C - `roleLink` and `nameOverview`, priority 1. The links a person
// opened have to be reachable, or the state change announced nothing useful.
test('the links inside an opened dropdown become reachable and convey the link role', async () => {
	await open(University);
	await readUntil(sr, { role: 'button', name: 'About' });
	await sr.press(sr.keys.enter);
	// No reannounce here: opening the dropdown grows the reading tree under the
	// cursor, so walking forward is what this row is about.
	await settle();
	expectConveys(await readUntil(sr, { role: 'link', name: 'Overview' }), {
		role: 'link',
		name: 'Overview',
	});
});

// Sequence D - `stateCurrentPage`, priority 1, and the row the shipped QDS
// family cannot make at all: it never shipped the part the attribute goes on.
test('the link for the page a person is on conveys that it is the current page', async () => {
	await open(University);
	await readUntil(sr, { role: 'button', name: 'About' });
	await sr.press(sr.keys.enter);
	await settle();
	expectConveys(await readUntil(sr, { role: 'link', name: 'Campus Tours' }), {
		role: 'link',
		name: 'Campus Tours',
		state: ['currentPage'],
	});
});

test('a link that is not the current page says nothing about being current', async () => {
	await open(University);
	await readUntil(sr, { role: 'button', name: 'About' });
	await sr.press(sr.keys.enter);
	await settle();
	const phrase = await readUntil(sr, { role: 'link', name: 'Overview' });
	expect(phrase).not.toContain(sr.vocabulary.currentPage);
});

// Sequence E - `stateChangeToCollapsed`, priority 1. Escape is also the
// authoring practices' dismissability requirement, and this family writes it by
// hand rather than inheriting it from the top layer.
//
// 'Escape' is spelled literally rather than taken off `sr.keys`, the way the OTP
// lane spells a digit: the reader key table names the reader's own commands, and
// Escape is a browser key every reader passes straight through.
test('pressing escape inside a dropdown announces the entry as collapsed again', async () => {
	await open(University);
	await readUntil(sr, { role: 'button', name: 'About' });
	await sr.press(sr.keys.enter);
	await settle();
	await readUntil(sr, { role: 'link', name: 'Overview' });

	await sr.press('Escape');
	await expectAnnouncesAfterChange({
		role: 'button',
		name: 'About',
		state: ['notExpanded'],
	});
});

// Sequence F - `roleRegion` and `nameMythicalUniversitySamplePageContent`, both
// priority 1. They are assertions about the PAGE rather than the navbar, and
// they are here because the plan carries them and a transcript over the plan's
// fixture reaches them.
test('the page content beside the navbar conveys its region role and name', async () => {
	await open(University);
	expectConveys(await readUntil(sr, { role: 'region' }), {
		role: 'region',
		name: 'Mythical University sample page content',
	});
});

// Ours, not aria-at's: the starter a consumer copies has a plain link at the top
// level, next to the entries that open dropdowns, and a reader has to tell them
// apart by role.
test('a plain top-level entry conveys the link role, not the button role', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'link', name: 'Home' }), {
		role: 'link',
		name: 'Home',
	});
	expectConveys(await readUntil(sr, { role: 'button', name: 'Products' }), {
		role: 'button',
		name: 'Products',
		state: ['notExpanded'],
	});
});
