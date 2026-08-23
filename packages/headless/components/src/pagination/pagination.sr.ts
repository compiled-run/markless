import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import Links from './scenarios/links.tsrx';
import TwoWidgets from './scenarios/two-widgets.tsrx';

// What a screen reader says about the pagination family. Each step names the
// facts the announcement has to convey - role, accessible name, state - and
// never a product's wording, so the same expectations run against NVDA and
// VoiceOver once those drivers land. `sr` is the only line that picks a reader.
//
// aria-at coverage, recorded honestly: there is none. The 40 test-plan folders
// under w3c/aria-at/tests/apg (read 2026-08-22, listed in full in
// goals/headless-components/notes/research-otp.md §4) contain no pagination
// plan, and w3.org/WAI/ARIA/apg has no pagination pattern - there is no role
// and no keyboard contract to conform to. The sequence letters below are
// research-pagination.md §6, which derives them from the semantics and says so.
// The one place a specification does name this exact case is WAI-ARIA 1.2's
// `aria-current`, whose `page` token is defined for a link in a set of
// pagination links; sequence C is that token.
//
// Every expectation here was captured from this reader's own output against
// these scenarios before it was written down, not predicted from the markup.
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

function expectDoesNotConvey(phrase: string, conveys: Conveys) {
	expect(missingFacts(sr, phrase, conveys), `${sr.name} announced "${phrase}"`).not.toEqual([]);
}

// Sequence A: the landmark. This is the row QDS fails, and the reason it matters
// is that a page with a site nav, a breadcrumb and a pagination has three
// navigation landmarks; unnamed, a reader lists three identical entries.
test('the pagination conveys the navigation landmark and its name', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'navigation' }), {
		role: 'navigation',
		name: 'Pagination',
	});
});

// Sequence B: a page you are not on is an ordinary button carrying its number,
// and it must not be conveyed as current. The absence is asserted rather than a
// word, because `aria-current`'s own default is "false" and no reader speaks it.
test('a page you are not on conveys the button role and its number, and never current', async () => {
	await open(Basic);
	const announcement = await readUntil(sr, { role: 'button', name: '3' });
	expectConveys(announcement, { role: 'button', name: '3' });
	expectDoesNotConvey(announcement, { state: ['currentPage'] });
});

// Sequence C: the page you are on. `aria-current="page"` is the family's one
// piece of state and the only thing separating this control from its neighbours.
test('the page you are on conveys that it is the current page', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'button', name: '1' }), {
		role: 'button',
		name: '1',
		state: ['currentPage'],
	});
});

// Sequence E: at page 1 the step-back control is shut and the step-forward one
// is not. Both facts come from the family - the scenario writes neither - and
// the pair is what catches a one-sided bound check.
test('at the first page the back control is unavailable and the forward control is not', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'button', name: 'Previous page' }), {
		role: 'button',
		name: 'Previous page',
		state: ['disabled'],
	});
	const forward = await readUntil(sr, { role: 'button', name: 'Next page' });
	expectConveys(forward, { role: 'button', name: 'Next page' });
	expectDoesNotConvey(forward, { state: ['disabled'] });
});

// Sequence F, the whole of it: activating a page control announces nothing of
// its own. What must happen is that "current page" MOVES - off the page you
// left, onto the page you asked for - and the reader is asked again until it
// does, because the change reaches the DOM after the dispatch it woke returns.
test('activating a page moves the current-page state to it and announces nothing else', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button', name: '3' });
	await sr.press(sr.keys.enter);
	await expect
		.poll(async () => missingFacts(sr, await sr.reannounce(), { state: ['currentPage'] }))
		.toEqual([]);
	const left = await readUntil(sr, { role: 'button', name: '1' });
	expectDoesNotConvey(left, { state: ['currentPage'] });
	// The page moved off 1, so the step-back control is no longer shut. Same
	// single fact - `page` - reaching a second control.
	expectDoesNotConvey(await readUntil(sr, { role: 'button', name: 'Previous page' }), {
		state: ['disabled'],
	});
});

// The link flavour: real navigation, so the controls are anchors. Same
// current-page state on a different role, which is the case WAI-ARIA's
// `aria-current` text is literally written about.
test('page links convey the link role and the current page among them', async () => {
	await open(Links);
	const inactive = await readUntil(sr, { role: 'link', name: '1' });
	expectConveys(inactive, { role: 'link', name: '1' });
	expectDoesNotConvey(inactive, { state: ['currentPage'] });
	expectConveys(await readUntil(sr, { role: 'link', name: '2' }), {
		role: 'link',
		name: '2',
		state: ['currentPage'],
	});
});

// Ours, not a sequence: nothing navigates while the results are loading. The
// scenario says `disabled` once, on the root; which controls report shut is
// what the family derives from that. The link is the interesting one - an
// anchor has no `disabled` attribute, so it says so with `aria-disabled` and
// stays in the reading order.
test('a locked pagination conveys every control as unavailable, links included', async () => {
	await open(Disabled);
	expectConveys(await readUntil(sr, { role: 'button', name: 'Previous page' }), {
		role: 'button',
		name: 'Previous page',
		state: ['disabled'],
	});
	expectConveys(await readUntil(sr, { role: 'button', name: '3' }), {
		role: 'button',
		name: '3',
		state: ['currentPage', 'disabled'],
	});
	expectConveys(await readUntil(sr, { role: 'link', name: '5' }), {
		role: 'link',
		name: '5',
		state: ['disabled'],
	});
	expectConveys(await readUntil(sr, { role: 'button', name: 'Next page' }), {
		role: 'button',
		name: 'Next page',
		state: ['disabled'],
	});
});

// Recorded red, not asserted green. Sequence A is about telling two navigation
// landmarks apart, and `two-widgets.tsrx` is written to do exactly that: its
// first pagination passes `aria-label="Reviews pages"`, and its own comment says
// the consumer's name wins because `aria-label` sits before the spread in
// `PaginationRoot`.
//
// It does not. Captured from this reader against that scenario: both landmarks
// announce "navigation, Pagination", so a person listing the landmarks on that
// page gets two identical entries and cannot tell the reviews pagination from
// the orders one - the precise failure the family's own default label exists to
// prevent. pagination.tsrx says as much in prose ("Only the second half holds
// today - a spread does not overwrite an attribute written before it either"),
// and this is that half, measured at the announcement.
//
// Not fixed here: this suite is coverage. Whoever makes a consumer's `aria-label`
// reach the `<nav>` deletes the `.fails`.
test.fails('a consumer replaces the landmark name so two paginations differ', async () => {
	await open(TwoWidgets);
	expect(missingFacts(sr, await readUntil(sr, { role: 'navigation' }), {
		role: 'navigation',
		name: 'Reviews pages',
	})).toEqual([]);
});
