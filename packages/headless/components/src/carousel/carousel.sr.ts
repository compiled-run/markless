import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import Tabbed from './scenarios/tabbed.tsrx';
import Untitled from './scenarios/untitled.tsrx';

// Rows assert the facts an announcement must convey - role, name, state - never a
// reader product's wording. `sr` is the only line that picks a reader, so the same
// expectations run against NVDA and VoiceOver once those drivers land.
//
// **There is no w3c/aria-at plan for carousel** (research-carousel.md §4b enumerates
// the plans that exist; carousel is not among them). The Sequence letters below are
// OURS, derived from the ARIA semantics in research-carousel.md §4c, not borrowed
// from a community-vetted assertion set. The one half of this family that does have
// an aria-at reference is the tabbed variant's picker, which is a `tablist` of `tab`s
// and is covered by `tabs-automatic-activation` / `tabs-manual-activation`.
//
// Every expectation here was captured from this reader's own output against these
// scenarios, not predicted from the markup.
const sr = virtualDriver;

async function open(component: Parameters<typeof render>[0]) {
	const { container } = await render(component);
	await sr.start(container as unknown as HTMLElement);
	return container as unknown as HTMLElement;
}

/**
 * Activate the rotation control the reading cursor is parked on, which stops the
 * rotation it started.
 *
 * Every row that starts the rotation MUST end by calling this, and MUST start it on a
 * scenario whose interval is long enough that no tick fires in between. Two measured
 * reasons, both of which show up somewhere other than the row that caused them:
 *
 * 1. Rotation is a running `setInterval` on the shared instance and nothing in this
 *    lane's teardown reaches it. A row that walks away leaves a timer running for the
 *    rest of the run; that made the *select* suite, later in the same serial lane,
 *    miss a poll deadline it otherwise meets.
 * 2. Every tick throws `ReferenceError: Invalid left-hand side in assignment` out of
 *    the compiled interval callback (`carousel.tsrx:symbol:11`). That is the
 *    mechanism behind the tick write never reaching the DOM. Vitest counts
 *    those as unhandled errors and fails the run on them even with every row green,
 *    so a row that lets a tick fire turns the lane red without failing an assertion.
 *
 * The rotation rows therefore use `Basic`, whose interval is the 3000ms default, and
 * not `GalleryAutoplay`, whose 80ms interval exists so a browser row can watch a
 * slide change. The tidier guard - dispatching `focusin` at the root in `afterEach`,
 * which is the APG's own rule for stopping rotation - reaches the same throw through
 * the root's focusin handler, so it is not available either.
 */
async function stopRotation() {
	await sr.press(sr.keys.enter);
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

/** Comfortably more items than any scenario here has, so a lap always wraps. */
const LAP = 20;

/**
 * Read an item again after a gesture has changed it: two full laps of the tree, which
 * both re-reads it from the live DOM and gives the refresh room to land.
 *
 * `reannounce()` is wrong here - measured, it steps off the item and lands somewhere
 * else entirely once the activation has run, which is the case the test-support README
 * warns about. A wall-clock `expect.poll` is wrong too, for a subtler reason worth
 * writing down: its deadline is spent walking, so the row's outcome depends on how many
 * items the scenario has. The same assertion passed on a 15-item tree and failed on an
 * 18-item one with the DOM measured correct in both. Laps, not seconds.
 */
async function readAgainUntil(conveys: Conveys) {
	return readUntil(sr, conveys, 2 * LAP);
}

/** Park the reading cursor on the first item whose phrase carries `word`. */
async function readUntilWord(word: string, limit = 2 * LAP) {
	const seen: string[] = [];
	let phrase = await sr.lastSpokenPhrase();
	for (let step = 0; step <= limit; step++) {
		seen.push(phrase);
		if (phrase.includes(word)) return phrase;
		await sr.next();
		phrase = await sr.lastSpokenPhrase();
	}
	throw new Error(
		`${sr.name} never announced "${word}" in ${limit} steps.\n` +
			`Transcript: ${JSON.stringify(seen, null, 1)}`,
	);
}

// Sequence A, step 3: the root. `aria-roledescription="carousel"` replaces the role
// word, so a person is told what kind of thing they have entered rather than being
// told "group", which says nothing. This is the fact the whole pattern rests on.
test('entering the carousel conveys that it is a carousel', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'carousel' }), { role: 'carousel' });
});

// Sequence A, step 2. Expected red, and the family's biggest accessibility debt:
// `carousel.root` wires no `aria-labelledby` to `carousel.title`, because the root
// cannot read a handle from the factory it roots in an IDREF position
// (MARKLESS_ELEMENT_HANDLE_IDREF_WIDGET_ROOT). Measured on
// this scenario: the root carries `aria-label=null` and `aria-labelledby=null`, and
// the title is announced as a separate text item further down instead of as the
// carousel's name. A page with two carousels therefore offers two identical
// anonymous entries. Whoever lifts that restriction wires the one line
// `carousel.title` already mints its handle for, and deletes the `.fails`.
test.fails('a titled carousel is named by its title', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'carousel' }), {
		role: 'carousel',
		name: 'Featured destinations',
	});
});

// Sequence B: no title part. The APG says a carousel's name must not contain the
// word carousel and `aria-roledescription` already says it, so an unnamed carousel
// gets no name rather than a bad one. This row is what
// catches QDS's `aria-label="content slideshow"` fallback: with it a reader says
// "content slideshow, carousel", the doubled-role wording research §2.2 rejects.
test('an untitled carousel conveys the carousel and no invented name', async () => {
	await open(Untitled);
	const entry = await readUntil(sr, { role: 'carousel' });
	expectConveys(entry, { role: 'carousel' });
	expectDoesNotConvey(entry, { name: 'content slideshow' });
	expect(sr.segments(entry), `${sr.name} announced "${entry}"`).toEqual([
		sr.vocabulary.carousel,
	]);
});

// Sequence C, step 2 (basic variant): a slide announces as a slide, again through
// `aria-roledescription` replacing "group". Without it a person walking the page
// hears three anonymous groups and cannot tell a slide from any other container.
test('arriving on a slide conveys that it is a slide', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'slide' }), { role: 'slide' });
});

// Sequence C, step 1. Expected red: QDS names every slide "{n} of {total}", which is
// the position semantics a person needs to know where they are in the set and how far
// it goes. Both halves need a per-part ordinal and a sibling count at render, and
// neither capability has landed, so `carousel.item` writes no
// `aria-label` at all. Measured: the slide's phrase is the role word alone and the
// slide's text content is announced as a separate item. Whoever lands render-time
// ordinals deletes the `.fails`.
test.fails('a slide is named with its position in the set', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'slide' }), { role: 'slide', name: '1 of 3' });
});

// Sequence D: the tabbed variant. The APG says the tabbed variant carries no
// `aria-roledescription`, so the slide is a tab panel and NOT also a slide. Getting
// both is the most likely mistake and is exactly what a conditional role produces if
// `aria-roledescription="slide"` is left on; the family drops it, and this row is the
// pair of assertions that proves the drop rather than assuming it.
test('a slide in the tabbed variant conveys the panel and never also a slide', async () => {
	await open(Tabbed);
	const panel = await readUntil(sr, { role: 'tabpanel' });
	expectConveys(panel, { role: 'tabpanel' });
	expectDoesNotConvey(panel, { role: 'slide' });
});

// The half of this family aria-at does cover, inherited from the tabs plans: the
// picker the carousel is showing reports itself chosen and the others do not. "Not
// selected" gets no vocabulary slot - it is asserted as the absence of the chosen
// fact, per the test-support README.
test('the picker for the showing slide conveys tab, its name and that it is chosen', async () => {
	await open(Tabbed);
	expectConveys(await readUntil(sr, { role: 'tab', name: '1' }), {
		role: 'tab',
		name: '1',
		state: ['selected'],
	});
	const other = await readUntil(sr, { role: 'tab', name: '2' });
	expectConveys(other, { role: 'tab', name: '2' });
	expectDoesNotConvey(other, { state: ['selected'] });
});

// The step controls. Their names come from the family, not from the scenario - the
// scenario's children are "Back" and "Next", which are announced separately - so an
// unlabelled step control is a family regression rather than a consumer mistake.
test('the step controls convey the button role and which way they move', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'button', name: 'Previous slide' }), {
		role: 'button',
		name: 'Previous slide',
	});
	expectConveys(await readUntil(sr, { role: 'button', name: 'Next slide' }), {
		role: 'button',
		name: 'Next slide',
	});
});

// Sequence F, step 1: the rotation control names the action it will perform, and the
// name flips once it has performed it. A control stuck on "start" after starting is
// the failure this catches, and the name is the only thing that reports the state.
test('the rotation control conveys the action it will perform, and flips once used', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'button', name: 'start automatic slide show' }), {
		role: 'button',
		name: 'start automatic slide show',
	});
	await sr.press(sr.keys.enter);
	await readAgainUntil({ role: 'button', name: 'stop automatic slide show' });
	// Back to rest, which is both the other half of the flip and the row's cleanup:
	// see `stopRotation`.
	await stopRotation();
	await readAgainUntil({ role: 'button', name: 'start automatic slide show' });
});

// Sequence F, step 2: no "pressed" / "not pressed". A rotation control is a command
// button, not a toggle button - its name already carries the state - and a reader
// saying either word means someone added `aria-pressed`. There is no honest
// vocabulary slot for a fact that must be absent, so this reads the reader's own word
// out of the phrase, the way the modal suite reads "alertdialog".
test('the rotation control is never conveyed as a pressed toggle', async () => {
	await open(Basic);
	const control = await readUntil(sr, { role: 'button', name: 'start automatic slide show' });
	expect(control, `${sr.name} announced "${control}"`).not.toContain('pressed');
	await sr.press(sr.keys.enter);
	const after = await readAgainUntil({
		role: 'button',
		name: 'stop automatic slide show',
	});
	expect(after, `${sr.name} announced "${after}"`).not.toContain('pressed');
	await stopRotation();
});

// Sequence E, and the one place this suite reads an attribute rather than a phrase.
//
// Measured on this reader: @guidepup/virtual-screen-reader implements no live-region
// announcement. Parked on the step-forward control with the log cleared, activating
// it moved the carousel to its second slide and the reader spoke only the control's
// own re-announcement - the spontaneous log carried nothing about the slide. So
// there is no announcement to assert, and inventing one would be exactly the
// expectation the test-support README forbids.
//
// What this row pins instead is the STATIC wiring the announcement depends on: the
// root is a polite live region while nothing is rotating, so a step a person made is
// spoken to them. The tick that would fill that region during autoplay does not run
// and is deliberately not asserted here. When a real-reader
// lane runs, this row is replaced by the announcement itself.
test('the root is a polite live region while nothing is rotating', async () => {
	const container = await open(Basic);
	const root = container.querySelector('[data-testid="root"]');
	expect(root?.getAttribute('aria-live')).toBe('polite');
	expect(root?.getAttribute('aria-atomic')).toBe('false');
	await readUntilWord('Next slide');
	await sr.press(sr.keys.enter);
	// The step landed, so the region a reader would have spoken did change.
	await expect
		.poll(() => container.querySelector('[ui-active]')?.getAttribute('ui-value'))
		.toBe('oslo');
	expect(root?.getAttribute('aria-live')).toBe('polite');
});

// Sequence E, the other side of the asymmetry and the reason the pattern exists: once
// the slides rotate on their own, the region goes quiet, because a person cannot be
// interrupted every few seconds by a change they did not ask for. Same measured
// limitation as the row above - the wiring is what is asserted, and the flip is
// driven through the rotation control rather than set by the scenario.
test('starting the rotation silences the live region', async () => {
	const container = await open(Basic);
	const root = container.querySelector('[data-testid="root"]');
	expect(root?.getAttribute('aria-live')).toBe('polite');
	await readUntil(sr, { role: 'button', name: 'start automatic slide show' });
	await sr.press(sr.keys.enter);
	await expect.poll(() => root?.getAttribute('aria-live')).toBe('off');
	await stopRotation();
});
