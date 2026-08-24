import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import Complete from './scenarios/complete.tsrx';
import CustomRange from './scenarios/custom-range.tsrx';
import Indeterminate from './scenarios/indeterminate.tsrx';

// Rows assert the facts an announcement must convey - role, name, value - never a reader product's wording.
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

test('reading the starter conveys the progressbar role and its current value', async () => {
	await open(Basic);
	const announcement = await readUntil(sr, { role: 'progressbar' });
	expectConveys(announcement, { role: 'progressbar' });
	// The percentage is our own aria-valuetext, so this pins our markup, not a reader's phrasing.
	expect(announcement, `${sr.name} announced "${announcement}"`).toContain('30%');
});

test('the visible label under the bar is reachable', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'progressbar' });
	await readUntil(sr, { name: 'Export data 30%' });
});

test('a finished job conveys a full bar', async () => {
	await open(Complete);
	const announcement = await readUntil(sr, { role: 'progressbar' });
	expectConveys(announcement, { role: 'progressbar' });
	expect(announcement, `${sr.name} announced "${announcement}"`).toContain('100%');
});

// Without a proportion of its own range, a reader speaks the raw number and a person hears one with no meaning.
test('a bar with its own range conveys the value as a proportion of that range', async () => {
	await open(CustomRange);
	const first = await readUntil(sr, { role: 'progressbar' });
	expect(first, `${sr.name} announced "${first}"`).toContain('80%');
	await sr.next();
	const second = await readUntil(sr, { role: 'progressbar' });
	expect(second, `${sr.name} announced "${second}"`).toContain('38%');
});

test('an indeterminate bar is still conveyed as a progressbar', async () => {
	await open(Indeterminate);
	expectConveys(await readUntil(sr, { role: 'progressbar' }), { role: 'progressbar' });
	await readUntil(sr, { name: 'Loading...' });
});

test('the bar is conveyed with the name its visible label gives it', async () => {
	await open(Basic);
	const announcement = await readUntil(sr, { role: 'progressbar' });
	expect(
		missingFacts(sr, announcement, { role: 'progressbar', name: 'Export data 30%' }),
	).toEqual([]);
});

// A "0%" computed from `min` would announce a job that has not started rather than one whose progress is unknown.
test('an indeterminate bar conveys no current value', async () => {
	await open(Indeterminate);
	const announcement = await readUntil(sr, { role: 'progressbar' });
	expect(announcement, `${sr.name} announced "${announcement}"`).not.toContain('0%');
});
