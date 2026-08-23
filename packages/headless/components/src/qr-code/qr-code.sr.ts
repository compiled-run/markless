import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import SpreadFirst from './scenarios/spread-first.tsrx';
import TwoFactorSetup from './scenarios/two-factor-setup.tsrx';
import Unnamed from './scenarios/unnamed.tsrx';

// Rows assert the facts an announcement must convey - role, name - never a reader
// product's wording. `sr` is the only line that picks a reader, so the same
// expectations run against NVDA and VoiceOver once those drivers land.
//
// There is no aria-at plan and no APG pattern here, because a QR code is an image
// rather than an interaction pattern. The sequence letters below come from
// research-qr-code.md §6, which derives them from the semantics of `role="img"`.
//
// Every expectation here was captured from this reader's own output against these
// scenarios, not predicted from the markup.
const sr = virtualDriver;

// The strings the scenarios encode. The family's worst failure mode is reading one of
// them aloud, so the rows that catch it have to hold the actual string.
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

// Sequence A, the negative half, and the reason the family refuses a default name: a
// name built from the value would read a URL aloud here and a TOTP secret aloud on
// the two-factor screen.
test('the encoded string is never announced', async () => {
	await open(Basic);
	for (const phrase of await lap(14)) {
		expect(phrase, `${sr.name} announced "${phrase}"`).not.toContain(SITE_URL);
	}
});

// Deliberately unnamed: an unnamed code is a real defect on a real screen, and this
// row proves it stays the consumer's to fix rather than being papered over with the
// pairing token.
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

// Expected red, and the cause is the reader rather than the markup. An element with
// `role="img"` is a leaf whose descendants are presentational, which is what makes a
// decorative logo safe inside `overlay`; the virtual reader builds its own tree from
// the DOM and does not prune children-presentational roles the way Chromium's tree
// does, so it walks in and announces the overlay's text. NVDA and VoiceOver are
// expected to pass this row. Kept red rather than ignored because the family has a
// markup-side answer available - `aria-hidden` on `overlay`, the way `patternsvg`
// already carries one - and choosing between that and fixing the reader lane is a
// design decision, not a coverage one.
test.fails('the overlay inside the code is never announced', async () => {
	await open(TwoFactorSetup);
	const name = 'Scan to add this account to your authenticator app';
	await readUntil(sr, { role: 'image', name });
	for (const phrase of await lap(3)) {
		expect(missingFacts(sr, phrase, { role: 'image', name })).toEqual([]);
	}
});
