import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import Complete from './scenarios/complete.tsrx';
import CustomRange from './scenarios/custom-range.tsrx';
import Indeterminate from './scenarios/indeterminate.tsrx';

// What a screen reader says about the progress family: each step names the facts
// the announcement has to convey - role, accessible name, and the value - and
// never a product's wording. `sr` is the only line that picks a reader, so the
// same expectations run against NVDA and VoiceOver once those drivers land.
//
// aria-at coverage, recorded honestly: there is no aria-at test plan for
// `role="progressbar"` to seed these sequences from. The reference is the ARIA
// specification's progressbar role and the APG's meter/progress guidance: a
// progress bar conveys its role, its accessible name, and its current value,
// where `aria-valuetext` is what a reader speaks when it is present, and an
// indeterminate bar carries no `aria-valuenow` at all.
//
// A progress bar has no gesture. It is not focusable, it is not operable, and a
// person only ever reads it - which is why every row below is a read and none is
// a keypress.
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
	// The percentage is our own `aria-valuetext`, not the reader's wording, so
	// asserting the string is asserting our markup rather than a product's phrase.
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

// A bar whose range is not 0-100 has to be conveyed as a proportion of its own
// range, or a reader reads "8000" and a person hears a number with no meaning.
test('a bar with its own range conveys the value as a proportion of that range', async () => {
	await open(CustomRange);
	const first = await readUntil(sr, { role: 'progressbar' });
	// value 20 of max 25 - four fifths of the way, not "20%".
	expect(first, `${sr.name} announced "${first}"`).toContain('80%');
	await sr.next();
	const second = await readUntil(sr, { role: 'progressbar' });
	// value 5000 in the range 2000-10000 - three eighths of the way.
	expect(second, `${sr.name} announced "${second}"`).toContain('38%');
});

test('an indeterminate bar is still conveyed as a progressbar', async () => {
	await open(Indeterminate);
	expectConveys(await readUntil(sr, { role: 'progressbar' }), { role: 'progressbar' });
	await readUntil(sr, { name: 'Loading...' });
});

// Recorded red, not asserted green. `progress.root` writes a hard-coded
// `aria-label="progress"`, so the bar's accessible name is the word "progress" for
// every bar on every page, and the visible `progress.label` is announced as a
// separate item the reader cannot connect to it. A person hears "progress bar,
// progress" and then, later, "Export data 30%". Whoever gives the root a real name
// - `aria-labelledby` pointing at the label part - deletes the `.fails`.
test.fails('the bar is conveyed with the name its visible label gives it', async () => {
	await open(Basic);
	const announcement = await readUntil(sr, { role: 'progressbar' });
	expect(
		missingFacts(sr, announcement, { role: 'progressbar', name: 'Export data 30%' }),
	).toEqual([]);
});

// Recorded red, not asserted green. An indeterminate bar correctly carries no
// `aria-valuenow`, but `valueText` still computes a percentage from `min`, so
// `aria-valuetext` says "0%" and the reader announces a job that has not started
// rather than one whose progress is unknown. The ARIA specification's rule is that
// an indeterminate bar reports no current value at all; whoever stops writing
// `aria-valuetext` in that case deletes the `.fails`.
test.fails('an indeterminate bar conveys no current value', async () => {
	await open(Indeterminate);
	const announcement = await readUntil(sr, { role: 'progressbar' });
	expect(announcement, `${sr.name} announced "${announcement}"`).not.toContain('0%');
});
