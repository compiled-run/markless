import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import Prefilled from './scenarios/prefilled.tsrx';

// What a screen reader says about the otp family. Each step names the facts the
// announcement has to convey - role, accessible name, state - and never a
// product's wording, so the same expectations run against NVDA and VoiceOver
// once those drivers land. `sr` is the only line that picks a reader.
//
// aria-at coverage, recorded honestly: there is none. The 40 test-plan folders
// under w3c/aria-at/tests/apg were read 2026-08-22 and listed in full in
// goals/headless-components/notes/research-otp.md §4; none of them is an OTP, a
// PIN, or a plain text-input plan, and w3.org/WAI/ARIA/apg has no one-time-code
// pattern either. So unlike tabs, this family has no community-vetted assertion
// set. The sequence letters below are research-otp.md §6, which derives them
// from the semantics and says so.
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

/**
 * Walk the whole widget once and hand back every announcement.
 *
 * The lap wraps: this reader returns to the top rather than stopping, so a
 * request for more steps than the widget holds re-reads it. That is exactly
 * what the duplication rows below want - anything reachable shows up.
 */
async function lap(steps: number): Promise<string[]> {
	const seen: string[] = [await sr.lastSpokenPhrase()];
	for (let step = 0; step < steps; step++) {
		await sr.next();
		seen.push(await sr.lastSpokenPhrase());
	}
	return seen;
}

// Sequence A: the field is a text input and announces as one. No "group", no
// "6 items", no per-slot announcement - the six painted boxes are aria-hidden,
// so the widget offers the reader exactly one thing.
test('the code field conveys the textbox role and its name', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'textbox' }), {
		role: 'textbox',
		name: 'Verification code',
	});
});

// Sequence A step 4: the code entered so far is the field's value, and the field
// is what carries it.
test('a code already entered is conveyed by the field itself', async () => {
	await open(Prefilled);
	const announcement = await readUntil(sr, { role: 'textbox' });
	expectConveys(announcement, { role: 'textbox', name: 'Verification code' });
	// The value is a string the consumer seeded, not a state word, so it is
	// asserted as the announcement's own content rather than through the
	// vocabulary: there is no reader-independent word for "holds 1234", and
	// every reader speaks the value itself.
	expect(sr.segments(announcement)).toContain('1234');
});

// Sequence B, the row the whole architecture exists for: the painted boxes must
// not put the code in the tree a second time. Asserted over a full lap rather
// than at one step, because a duplicate anywhere in the reading order is the
// defect - QDS's bug is that browse-mode navigation reads the code, then reads
// it again.
test('nothing but the field is reachable, so the code is never announced twice', async () => {
	await open(Prefilled);
	await readUntil(sr, { role: 'textbox' });
	for (const phrase of await lap(24)) {
		expectConveys(phrase, { role: 'textbox' });
	}
});

// Sequence B, the keystroke: typing changes the field's value and produces no
// second announcement from the painted box that redrew.
test('typing a character updates the field the reader reads and nothing else', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'textbox' });
	await sr.press('4');
	// The typed character reaches the DOM after the dispatch it woke returns, so
	// the reader is asked again until the field reads back with it.
	await expect
		.poll(async () => {
			const phrase = await sr.reannounce();
			return [
				...missingFacts(sr, phrase, { role: 'textbox', name: 'Verification code' }),
				...(sr.segments(phrase).includes('4') ? [] : [`value "4" in "${phrase}"`]),
			];
		})
		.toEqual([]);
});

// Ours, not a sequence: a code field nobody may type in yet. Two widgets on one
// page, each with its own name and its own partial value, and both shut.
test('a locked field conveys that it is unavailable, with its own name and value', async () => {
	await open(Disabled);
	expectConveys(await readUntil(sr, { role: 'textbox', name: 'Verification code' }), {
		role: 'textbox',
		name: 'Verification code',
		state: ['disabled'],
	});
	const backup = await readUntil(sr, { role: 'textbox', name: 'Backup code' });
	expectConveys(backup, { role: 'textbox', name: 'Backup code', state: ['disabled'] });
	expect(sr.segments(backup)).toContain('12');
});
