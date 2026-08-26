import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import Complete from './scenarios/complete.tsrx';
import CustomRange from './scenarios/custom-range.tsrx';
import Indeterminate from './scenarios/indeterminate.tsrx';
import OwnName from './scenarios/own-name.tsrx';
import OwnText from './scenarios/own-text.tsrx';

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
	await readUntil(sr, { name: 'Export data' });
});

// The bar already reports the percentage as its own value; the value label is a
// separate stop on the walk that speaks the same number as plain text.
test('the value label is reachable and speaks the percentage', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'progressbar' });
	await readUntil(sr, { name: '30%' });
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

// Children replace the percentage, so what is spoken is the consumer's own text.
test('a value label the consumer wrote is conveyed as its own text', async () => {
	await open(OwnText);
	await readUntil(sr, { role: 'progressbar' });
	await readUntil(sr, { name: '30 of 100 rows' });
});

// The bar takes the authored measurement as its own value, so a reader speaks it
// on the bar rather than a percentage the consumer chose not to show.
test('the bar conveys the measurement the consumer wrote', async () => {
	await open(OwnText);
	const announcement = await readUntil(sr, { role: 'progressbar' });
	expect(announcement, `${sr.name} announced "${announcement}"`).toContain('30 of 100 rows');
	expect(announcement, `${sr.name} announced "${announcement}"`).not.toContain('30%');
});

// The bar's name is the label part's text, so a reader hears what the page shows.
test('the bar is conveyed with the label part as its name', async () => {
	await open(Basic);
	const announcement = await readUntil(sr, { role: 'progressbar' });
	expectConveys(announcement, { role: 'progressbar', name: 'Export data' });
});

// With no label part mounted the family writes no name of its own, so the one the
// consumer spread in is what a reader speaks.
test('a bar named by the consumer conveys that name', async () => {
	await open(OwnName);
	const announcement = await readUntil(sr, { role: 'progressbar' });
	expectConveys(announcement, { role: 'progressbar', name: 'Export data' });
});

// A "0%" computed from `min` would announce a job that has not started rather than one whose progress is unknown.
test('an indeterminate bar conveys no current value', async () => {
	await open(Indeterminate);
	const announcement = await readUntil(sr, { role: 'progressbar' });
	expect(announcement, `${sr.name} announced "${announcement}"`).not.toContain('0%');
});
