import { render } from '@markless/vitest-browser';
import { userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import Invalid from './scenarios/invalid.tsrx';
import Locked from './scenarios/locked.tsrx';
import Prefilled from './scenarios/prefilled.tsrx';
import WithHelp from './scenarios/with-help.tsrx';

// What a screen reader says about the textbox family: each step names the facts
// the announcement has to convey - role, accessible name, state, and the value the
// field holds - and never a product's wording. `sr` is the only line that picks a
// reader, so the same expectations run against NVDA and VoiceOver once those
// drivers land.
//
// aria-at coverage, recorded honestly: aria-at has no plan for a plain text input.
// The reference is the ARIA specification's textbox role and the HTML accessibility
// mapping: a text field conveys its role, its accessible name, its value, and the
// restrictions on it - required, read-only, disabled, invalid.
const sr = virtualDriver;

// One scenario per test: the input id is minted per container, so two scenarios
// alive in one document give two inputs the same id and every `<label for>` after
// the first resolves to the wrong field.
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

test('reading the starter conveys the textbox role and its name', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'textbox' }), {
		role: 'textbox',
		name: 'Username',
	});
});

// The name comes from `aria-labelledby` on the input pointing at the label part,
// which is what makes the label a name rather than a nearby piece of text. This row
// is the one that catches that reference going missing.
test('a field that arrives with a value conveys that value', async () => {
	await open(Prefilled);
	const announcement = await readUntil(sr, { role: 'textbox' });
	expectConveys(announcement, { role: 'textbox', name: 'Username' });
	// The value is the consumer's own string, not the reader's wording.
	expect(announcement, `${sr.name} announced "${announcement}"`).toContain('test value');
});

// Typing is the family's one gesture, and what a person hears afterwards has to be
// what the field now holds.
test('what a person types becomes the value the reader conveys', async () => {
	const { container } = await render(Basic);
	const root = container as unknown as HTMLElement;
	await sr.start(root);
	await readUntil(sr, { role: 'textbox' });
	await userEvent.fill(root.querySelector('[data-testid="input"]') as HTMLInputElement, 'ada');
	await expect.poll(async () => (await sr.reannounce()).includes('ada')).toBe(true);
});

test('a field a person may read but not change conveys every restriction on it', async () => {
	await open(Locked);
	const announcement = await readUntil(sr, { role: 'textbox' });
	expectConveys(announcement, {
		role: 'textbox',
		name: 'Username',
		state: ['disabled'],
	});
	// read-only and required are facts this reader states in its own words, and the
	// seam holds no slot for either yet; asserted as our markup rather than as a
	// vocabulary entry until a second reader says what it calls them.
	expect(announcement, `${sr.name} announced "${announcement}"`).toContain('read only');
	expect(announcement, `${sr.name} announced "${announcement}"`).toContain('required');
});

test('a mounted error part makes the reader convey the field as invalid', async () => {
	await open(Invalid);
	expectConveys(await readUntil(sr, { role: 'textbox', name: 'Password' }), {
		role: 'textbox',
		name: 'Password',
		state: ['invalid'],
	});
});

test('a field with only help text under it is never conveyed as invalid', async () => {
	await open(WithHelp);
	const announcement = await readUntil(sr, { role: 'textbox' });
	expectConveys(announcement, { role: 'textbox', name: 'Email' });
	// This reader speaks "not invalid" as its own fact, so the assertion above
	// cannot be read as "invalid is absent"; that is what this line proves.
	expect(missingFacts(sr, announcement, { state: ['invalid'] })).not.toEqual([]);
});

// Recorded red, not asserted green. The same gap `checkbox.sr.ts` records:
// `<textbox.description>` renders a plain div and wires no `aria-describedby`, so
// the reader announces the help text as a separate item rather than as part of the
// field. Whoever wires it deletes the `.fails`.
test.fails('the help text under a field is conveyed with the field itself', async () => {
	await open(WithHelp);
	const announcement = await readUntil(sr, { role: 'textbox' });
	expect(
		missingFacts(sr, announcement, { name: "We'll never share your email" }),
	).toEqual([]);
});

// Recorded red, not asserted green. Mounting `<textbox.error>` marks the control
// invalid, which the reader does convey - but the error's own text is wired to
// nothing, so a person is told the field is invalid and never told why. This is
// the more serious half of the missing-description gap: an invalid field with an
// unreachable reason. Whoever wires `aria-describedby` deletes the `.fails`.
test.fails('the reason a field is invalid is conveyed with the field', async () => {
	await open(Invalid);
	const announcement = await readUntil(sr, { role: 'textbox', name: 'Password' });
	expect(missingFacts(sr, announcement, { name: 'Password is required' })).toEqual([]);
});
