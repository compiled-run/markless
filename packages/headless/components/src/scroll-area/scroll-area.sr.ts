import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import NamedByHandle from './scenarios/named-by-handle.tsrx';
import NamedByHeading from './scenarios/named-by-heading.tsrx';
import TwoAreas from './scenarios/two-areas.tsrx';

// What a screen reader says about the scroll-area family. Each step names the
// facts the announcement has to convey - role, accessible name - and never a
// product's wording, so the same expectations run against NVDA and VoiceOver
// once those drivers land. `sr` is the only line that picks a reader.
//
// aria-at coverage, recorded honestly: there is none. No plan for scroll area,
// for scrollbar, or for region among the 40 test-plan folders under
// w3c/aria-at/tests/apg (read 2026-08-22, listed in full in
// goals/headless-components/notes/research-otp.md §4), and w3.org/WAI/ARIA/apg
// has no scroll-area pattern. WAI-ARIA does define `role="scrollbar"`, and
// research-scroll-area.md §4 records it as a trap this family deliberately does
// not use. The sequence letters below are that note's §6, derived from the
// semantics and said to be so.
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

// Sequence A: the viewport is the family, and the role is what lets the
// consumer's name be announced at all. Without both, a keyboard user lands on a
// box with no role and no name and has no idea what they are inside.
test('the viewport conveys the region role and the name the consumer gave it', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'region' }), {
		role: 'region',
		name: 'Parking rules',
	});
});

// The same name written as an IDREF to a heading that is already on the screen,
// rather than repeating the words in an `aria-label`. Both spellings have to
// reach the announcement, because a consumer who already has a heading should
// not have to say it twice.
test('a viewport named by a heading is announced with the heading text', async () => {
	await open(NamedByHeading);
	expectConveys(await readUntil(sr, { role: 'region' }), {
		role: 'region',
		name: 'Terms of service',
	});
});

// The handle spelling of the same thing. `named-by-handle.tsrx` still carries a
// comment saying this does not work across a component tag; at the announcement
// it does, and the browser suite's own row says the handle now reaches the
// element. Recorded here as green so the two suites agree and the stale comment
// is the only thing left to correct.
test('a viewport named by an element handle is announced with the heading text', async () => {
	await open(NamedByHandle);
	expectConveys(await readUntil(sr, { role: 'region' }), {
		role: 'region',
		name: 'Terms of service',
	});
});

// Sequence D: two areas on one page, each announced with its own name. QDS
// fails this by hard-coding a single "Scrollable content" for every area, which
// leaves a person listing the regions with two identical entries.
test('two areas on one page convey two different names', async () => {
	await open(TwoAreas);
	expectConveys(await readUntil(sr, { role: 'region' }), {
		role: 'region',
		name: 'Open incidents',
	});
	expectConveys(await readUntil(sr, { role: 'region', name: 'Resolved incidents' }), {
		role: 'region',
		name: 'Resolved incidents',
	});
});

// Sequence C: the painted scrollbar and its thumb are decoration and must not be
// in the reading order. They sit after the viewport inside the same root, so
// anything they contributed would land between the end of one area's content and
// the start of the next area.
//
// Proved by counting steps rather than by asserting a word, because a decorative
// `<div>` with no text has no word to assert - the only evidence that nothing is
// there is that nothing takes a step. The two steps between the last paragraph
// and the second area are this reader's own structural boundary markers, one
// closing the paragraph and one closing the region; a reader that marks
// boundaries differently re-measures this number, which is why it is the one row
// here that does not transfer unchanged.
test('the painted scrollbar and thumb take no step in the reading order', async () => {
	await open(TwoAreas);
	await readUntil(sr, { role: 'region', name: 'Open incidents' });
	await readUntil(sr, { name: 'Invoice PDFs render without the tax line for one plan.' });
	const stepsToSecondArea = 3;
	for (let step = 1; step < stepsToSecondArea; step++) {
		await sr.next();
		const phrase = await sr.lastSpokenPhrase();
		expect(
			missingFacts(sr, phrase, { role: 'region', name: 'Resolved incidents' }),
			`${sr.name} reached the second area early, at step ${step}, with "${phrase}"`,
		).not.toEqual([]);
	}
	await sr.next();
	expectConveys(await sr.lastSpokenPhrase(), {
		role: 'region',
		name: 'Resolved incidents',
	});
});
