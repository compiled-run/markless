import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import Links from './scenarios/links.tsrx';
import TwoWidgets from './scenarios/two-widgets.tsrx';

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

function expectDoesNotConvey(phrase: string, conveys: Conveys) {
	expect(missingFacts(sr, phrase, conveys), `${sr.name} announced "${phrase}"`).not.toEqual([]);
}

// A page with a site nav, a breadcrumb and a pagination has three navigation landmarks; unnamed, a reader lists three identical entries.
test('the pagination conveys the navigation landmark and its name', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'navigation' }), {
		role: 'navigation',
		name: 'Pagination',
	});
});

// Asserted as an absence: `aria-current`'s default is "false" and no reader speaks it.
test('a page you are not on conveys the button role and its number, and never current', async () => {
	await open(Basic);
	const announcement = await readUntil(sr, { role: 'button', name: '3' });
	expectConveys(announcement, { role: 'button', name: '3' });
	expectDoesNotConvey(announcement, { state: ['currentPage'] });
});

test('the page you are on conveys that it is the current page', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'button', name: '1' }), {
		role: 'button',
		name: '1',
		state: ['currentPage'],
	});
});

// Both facts come from the family, and the pair is what catches a one-sided bound check.
test('at the first page the back control is unavailable and the forward control is not', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'button', name: 'Previous page' }), {
		role: 'button',
		name: 'Previous page',
		state: ['disabled'],
	});
	const forward = await readUntil(sr, { role: 'button', name: 'Next page' });
	expectConveys(forward, { role: 'button', name: 'Next page' });
	expectDoesNotConvey(forward, { state: ['disabled'] });
});

// Activating a page announces nothing of its own; what must happen is that current-page moves off the page you left and onto the one you asked for.
test('activating a page moves the current-page state to it and announces nothing else', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button', name: '3' });
	await sr.press(sr.keys.enter);
	await expect
		.poll(async () => missingFacts(sr, await sr.reannounce(), { state: ['currentPage'] }))
		.toEqual([]);
	const left = await readUntil(sr, { role: 'button', name: '1' });
	expectDoesNotConvey(left, { state: ['currentPage'] });
	// The same single fact reaching a second control: off page 1, the step-back control is no longer shut.
	expectDoesNotConvey(await readUntil(sr, { role: 'button', name: 'Previous page' }), {
		state: ['disabled'],
	});
});

test('page links convey the link role and the current page among them', async () => {
	await open(Links);
	const inactive = await readUntil(sr, { role: 'link', name: '1' });
	expectConveys(inactive, { role: 'link', name: '1' });
	expectDoesNotConvey(inactive, { state: ['currentPage'] });
	expectConveys(await readUntil(sr, { role: 'link', name: '2' }), {
		role: 'link',
		name: '2',
		state: ['currentPage'],
	});
});

// The scenario says `disabled` once on the root. The link is the interesting one: an anchor has no `disabled` attribute, so it uses aria-disabled and stays in the reading order.
test('a locked pagination conveys every control as unavailable, links included', async () => {
	await open(Disabled);
	expectConveys(await readUntil(sr, { role: 'button', name: 'Previous page' }), {
		role: 'button',
		name: 'Previous page',
		state: ['disabled'],
	});
	expectConveys(await readUntil(sr, { role: 'button', name: '3' }), {
		role: 'button',
		name: '3',
		state: ['currentPage', 'disabled'],
	});
	expectConveys(await readUntil(sr, { role: 'link', name: '5' }), {
		role: 'link',
		name: '5',
		state: ['disabled'],
	});
	expectConveys(await readUntil(sr, { role: 'button', name: 'Next page' }), {
		role: 'button',
		name: 'Next page',
		state: ['disabled'],
	});
});

// Expected red: a spread does not overwrite an attribute written before it, so a consumer's aria-label never reaches the `<nav>` and both landmarks announce the default name.
test.fails('a consumer replaces the landmark name so two paginations differ', async () => {
	await open(TwoWidgets);
	expect(missingFacts(sr, await readUntil(sr, { role: 'navigation' }), {
		role: 'navigation',
		name: 'Reviews pages',
	})).toEqual([]);
});
