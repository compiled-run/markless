import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import SpreadFirst from './scenarios/spread-first.tsrx';
import TwoFactorSetup from './scenarios/two-factor-setup.tsrx';
import Unnamed from './scenarios/unnamed.tsrx';

// Rows assert the facts an announcement must convey - role, name - never a reader product's wording.
const sr = virtualDriver;

// The strings the scenarios encode: the family's worst failure is reading one aloud, so the rows that catch it hold the actual string.
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

// The geometry says nothing and is hidden, so the code is a leaf carrying the consumer's name.
test('the code conveys the image role and the name the consumer gave it', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'image' }), {
		role: 'image',
		name: 'Scan to open the site',
	});
});

// Why the family refuses a default name: one built from the value would read a URL aloud here and a shared secret aloud on the two-factor screen.
test('the encoded string is never announced', async () => {
	await open(Basic);
	for (const phrase of await lap(14)) {
		expect(phrase, `${sr.name} announced "${phrase}"`).not.toContain(SITE_URL);
	}
});

// An unnamed code is a real defect, and it stays the consumer's to fix rather than being papered over with the encoded value.
test('a code with no name given is announced with no name, not with its value', async () => {
	await open(Unnamed);
	const announcement = await readUntil(sr, { role: 'image' });
	expectConveys(announcement, { role: 'image' });
	expect(announcement, `${sr.name} announced "${announcement}"`).not.toContain(PAIRING_TOKEN);
	expect(sr.segments(announcement)).toHaveLength(1);
});

// Without aria-hidden on the pattern, some reader and browser pairs expose the `<svg>` as a second graphic and a few expose its paths.
test('nothing inside the code is reachable, so a lap only ever finds the image', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'image' });
	for (const phrase of await lap(14)) {
		expectConveys(phrase, { role: 'image', name: 'Scan to open the site' });
	}
});

// Every part spreads the consumer's props first, so the family's own attributes land last and win.
test("a consumer's own role does not displace the image role", async () => {
	await open(SpreadFirst);
	expectConveys(await readUntil(sr, { role: 'image' }), {
		role: 'image',
		name: 'Scan to open the page',
	});
});

// Expected red against this reader, not the markup: it does not prune children-presentational roles the way a browser's tree does, so it walks into the image and reads the overlay.
test.fails('the overlay inside the code is never announced', async () => {
	await open(TwoFactorSetup);
	const name = 'Scan to add this account to your authenticator app';
	await readUntil(sr, { role: 'image', name });
	for (const phrase of await lap(3)) {
		expect(missingFacts(sr, phrase, { role: 'image', name })).toEqual([]);
	}
});
