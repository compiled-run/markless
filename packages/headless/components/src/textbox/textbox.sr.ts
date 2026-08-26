import { render } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import HelpAndError from './scenarios/help-and-error.tsrx';
import Invalid from './scenarios/invalid.tsrx';
import Locked from './scenarios/locked.tsrx';
import Prefilled from './scenarios/prefilled.tsrx';
import WithHelp from './scenarios/with-help.tsrx';

// Rows assert the facts an announcement must convey - role, name, state, value - never a reader product's wording.
const sr = virtualDriver;

const Input = page.getByTestId('input');

// One scenario per test: input ids are minted per container, so two live scenarios give two inputs the same id and every `<label for>` after the first resolves wrong.
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

test('a field that arrives with a value conveys that value', async () => {
	await open(Prefilled);
	const announcement = await readUntil(sr, { role: 'textbox' });
	expectConveys(announcement, { role: 'textbox', name: 'Username' });
	// The value is the consumer's own string, not the reader's wording.
	expect(announcement, `${sr.name} announced "${announcement}"`).toContain('test value');
});

test('what a person types becomes the value the reader conveys', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'textbox' });
	await userEvent.fill(Input.element() as HTMLInputElement, 'ada');
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
	// No vocabulary slot for read-only or required yet, so these two stay literal.
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
	// This reader speaks "not invalid" as its own fact, so the absence needs its own assertion.
	expect(missingFacts(sr, announcement, { state: ['invalid'] })).not.toEqual([]);
});

// The description binds the handle the control names through aria-describedby, so it is part of the field rather than a separate item down the page.
test('the help text under a field is conveyed with the field itself', async () => {
	await open(WithHelp);
	const announcement = await readUntil(sr, { role: 'textbox' });
	expect(
		missingFacts(sr, announcement, { name: "We'll never share your email" }),
	).toEqual([]);
});

// Mounting the error part marks the control invalid and makes its text the description, so a person is told both that the field is invalid and why.
test('the reason a field is invalid is conveyed with the field', async () => {
	await open(Invalid);
	const announcement = await readUntil(sr, { role: 'textbox', name: 'Password' });
	expect(missingFacts(sr, announcement, { name: 'Password is required' })).toEqual([]);
});

// Both messages bind handles the control names, so both are part of the field rather than separate items down the page.
test('the error and the help text are both conveyed with the field', async () => {
	await open(HelpAndError);
	const phrase = await readUntil(sr, { role: 'textbox', name: 'Email' });
	expect(phrase, `${sr.name} announced "${phrase}"`).toContain('Email format is invalid');
	expect(phrase, `${sr.name} announced "${phrase}"`).toContain('Enter a valid email address');
	// What is wrong is conveyed before the hint, though the hint is written above the error in this page.
	expect(phrase.indexOf('Email format is invalid')).toBeLessThan(
		phrase.indexOf('Enter a valid email address'),
	);
});
