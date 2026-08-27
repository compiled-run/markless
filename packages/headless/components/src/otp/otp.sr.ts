import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import Prefilled from './scenarios/prefilled.tsrx';

// Rows assert the facts an announcement must convey - role, name, state - never a reader product's wording.
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

/** Walk the widget and hand back every announcement. The lap wraps, which is what the duplication rows want: anything reachable shows up. */
async function lap(steps: number): Promise<string[]> {
	const seen: string[] = [await sr.lastSpokenPhrase()];
	for (let step = 0; step < steps; step++) {
		await sr.next();
		seen.push(await sr.lastSpokenPhrase());
	}
	return seen;
}

test('the code field conveys the textbox role and its name', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'textbox' }), {
		role: 'textbox',
		name: 'Verification code',
	});
});

test('a code already entered is conveyed by the field itself', async () => {
	await open(Prefilled);
	const announcement = await readUntil(sr, { role: 'textbox' });
	expectConveys(announcement, { role: 'textbox', name: 'Verification code' });
	// The value has no vocabulary word - every reader just speaks it - so it is asserted on the announcement's content.
	expect(sr.segments(announcement)).toContain('1234');
});

// Asserted over a full lap, not at one step: a duplicate anywhere in the reading order is the defect.
// The boxes carry no ARIA of their own, so a walk finds the field and then each painted character.
test('the walk finds the field and then the boxes, and nothing else', async () => {
	await open(Prefilled);
	await readUntil(sr, { role: 'textbox' });
	const spoken = await lap(24);
	expect(spoken.some((phrase) => sr.segments(phrase).includes('1'))).toBe(true);
	for (const phrase of spoken) {
		expect(phrase, `${sr.name} announced "${phrase}"`).not.toContain('button');
	}
});

test('typing a character updates the field the reader reads and nothing else', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'textbox' });
	await sr.press('4');
	// The typed character reaches the DOM after the dispatch it woke returns, so the reader is asked again.
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
