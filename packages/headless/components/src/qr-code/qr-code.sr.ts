import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import SpreadFirst from './scenarios/spread-first.tsrx';
import TwoFactorSetup from './scenarios/two-factor-setup.tsrx';
import Unnamed from './scenarios/unnamed.tsrx';

// What a screen reader says about the qr-code family. Each step names the facts
// the announcement has to convey - role, accessible name - and never a
// product's wording, so the same expectations run against NVDA and VoiceOver
// once those drivers land. `sr` is the only line that picks a reader.
//
// aria-at coverage, recorded honestly: there is none, and there never will be.
// The 40 test-plan folders under w3c/aria-at/tests/apg (read 2026-08-22, listed
// in full in goals/headless-components/notes/research-otp.md §4) hold no plan
// for `img`, for graphics, or for QR codes, and w3.org/WAI/ARIA/apg has no
// QR-code pattern because a QR code is an image, not an interaction pattern.
// The sequence letters below are research-qr-code.md §6, derived from the
// semantics of `role="img"` and said to be so.
//
// Every expectation here was captured from this reader's own output against
// these scenarios before it was written down, not predicted from the markup.
const sr = virtualDriver;

// The strings the scenarios encode. Named here because the family's single
// worst failure mode is reading one of them aloud, and a test for that has to
// hold the actual string.
const SITE_URL = 'https://markless.dev';
const PAIRING_TOKEN = 'https://example.com/pair/8f3a';

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

/** Walk the whole widget once and hand back every announcement. */
async function lap(steps: number): Promise<string[]> {
	const seen: string[] = [await sr.lastSpokenPhrase()];
	for (let step = 0; step < steps; step++) {
		await sr.next();
		seen.push(await sr.lastSpokenPhrase());
	}
	return seen;
}

// Sequence A: one announcement, one object. Not "group", not a hundred path
// segments - the geometry says nothing and is hidden, so the code is a leaf
// carrying the consumer's name.
test('the code conveys the image role and the name the consumer gave it', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'image' }), {
		role: 'image',
		name: 'Scan to open the site',
	});
});

// Sequence A, the negative half, and the family's whole reason for refusing a
// default name: QDS names its code `QR code for ${value}`, which here would read
// a URL aloud and on the two-factor screen would read a TOTP secret aloud.
test('the encoded string is never announced', async () => {
	await open(Basic);
	for (const phrase of await lap(14)) {
		expect(phrase, `${sr.name} announced "${phrase}"`).not.toContain(SITE_URL);
	}
});

// The probe scenario, deliberately unnamed: the family invents nothing. An
// unnamed code is a real defect on a real screen, and this row proves the
// defect is the consumer's to fix rather than one the family papered over with
// the pairing token.
test('a code with no name given is announced with no name, not with its value', async () => {
	await open(Unnamed);
	const announcement = await readUntil(sr, { role: 'image' });
	expectConveys(announcement, { role: 'image' });
	expect(announcement, `${sr.name} announced "${announcement}"`).not.toContain(PAIRING_TOKEN);
	// Nothing beyond the role: no name, invented or otherwise.
	expect(sr.segments(announcement)).toHaveLength(1);
});

// Sequence B: nothing inside is reachable. `patternsvg` is `aria-hidden`, so a
// lap over the widget only ever arrives back at the image; without it some
// reader and browser combinations expose the `<svg>` as a second graphic and a
// few expose `<path>` elements, producing an announcement nested inside an
// image.
test('nothing inside the code is reachable, so a lap only ever finds the image', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'image' });
	for (const phrase of await lap(14)) {
		expectConveys(phrase, { role: 'image', name: 'Scan to open the site' });
	}
});

// Every part spreads the consumer's props first, so the family's own attributes
// land last and win. `spread-first.tsrx` passes `role="button"` on the root,
// which is the one prop that could turn the code into something it is not.
test("a consumer's own role does not displace the image role", async () => {
	await open(SpreadFirst);
	expectConveys(await readUntil(sr, { role: 'image' }), {
		role: 'image',
		name: 'Scan to open the page',
	});
});

// Recorded red, not asserted green. research-qr-code.md §6 sequence C states it
// as a fact about the platform: an element with `role="img"` is a leaf, its
// descendants are presentational, so anything a consumer puts in `overlay` is
// not announced. That is what makes a decorative logo safe to put there.
//
// Captured from this reader against `two-factor-setup.tsrx`, whose overlay holds
// the word "Acme": the lap reads "image, <name>", then "Acme", then
// "end of image, <name>". The overlay's content IS announced, and the reader
// walks into the image to reach it.
//
// The cause is the reader, not the markup: @guidepup/virtual-screen-reader
// builds its own tree from the DOM and does not prune children-presentational
// roles the way Chromium's own tree does, so NVDA and VoiceOver are expected to
// pass this row where this one fails. That is worth pinning rather than
// ignoring, because the family has a markup-side answer available - an
// `aria-hidden` on `overlay`, the way `patternsvg` already carries one - which
// would make the behaviour the same on every reader. Choosing between "fix the
// reader lane" and "hide the overlay" is a design decision this coverage unit
// does not get to make.
test.fails('the overlay inside the code is never announced', async () => {
	await open(TwoFactorSetup);
	const name = 'Scan to add this account to your authenticator app';
	await readUntil(sr, { role: 'image', name });
	for (const phrase of await lap(3)) {
		expect(missingFacts(sr, phrase, { role: 'image', name })).toEqual([]);
	}
});
