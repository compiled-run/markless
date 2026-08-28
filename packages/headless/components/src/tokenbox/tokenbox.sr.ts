import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Prefilled from './scenarios/prefilled.tsrx';
import PromptForm from './scenarios/prompt-form.tsrx';

// Rows assert the facts an announcement has to convey - what the control is, its
// name, its state - never a reader product's wording.
const sr = virtualDriver;

async function open(component: Parameters<typeof render>[0]) {
	const { container } = await render(component);
	await sr.start(container as unknown as HTMLElement);
}

afterEach(async () => {
	await sr.stop().catch(() => {});
});

function expectConveysFacts(phrase: string, conveys: Conveys) {
	expect(missingFacts(sr, phrase, conveys), `${sr.name} announced "${phrase}"`).toEqual([]);
}

// The whole box is ONE control. That is the inversion from taglist, whose tags
// are separate buttons a reader lands on one at a time: here a reader arrives at
// a single textbox, and the tokens are characters inside it.
test('the box reaches a reader as one textbox with the name its label gives it', async () => {
	await open(Prefilled);
	expectConveysFacts(await readUntil(sr, { role: 'textbox', name: 'Draft' }), {
		role: 'textbox',
		name: 'Draft',
	});
});

test('a box in an invalid state conveys that, not just its name', async () => {
	await open(PromptForm);
	expectConveysFacts(await readUntil(sr, { role: 'textbox', name: 'Prompt' }), {
		role: 'textbox',
		name: 'Prompt',
		state: ['invalid'],
	});
});

// The claim a reader lane exists to settle: a token is not a separate thing to
// find, it is text inside the field. If a token were ever exposed as its own
// node, this row would find a second control between the box and its value.
test('a token is text inside the box rather than a control of its own', async () => {
	const { container } = await render(Prefilled);
	const scope = container as unknown as HTMLElement;
	await sr.start(scope);

	const surface = scope.querySelector('[role="textbox"]') as HTMLElement;
	expect(surface.textContent).toBe('Ask Alice Chen about Q3 plan today');
	// Nothing inside the box carries a role, so nothing inside it is a stop.
	expect(surface.querySelectorAll('[role]')).toHaveLength(0);
	expect(surface.querySelectorAll('[tabindex]')).toHaveLength(0);
	// And a token's label is its own text, which is what a reader crossing it says.
	expect([...surface.querySelectorAll('[ui-token]')].map((one) => one.textContent)).toEqual([
		'Alice Chen',
		'Q3 plan',
	]);
});

test('a single-line box says so, so a reader does not offer a paragraph', async () => {
	const { container } = await render(Prefilled);
	const scope = container as unknown as HTMLElement;
	await sr.start(scope);

	const surface = scope.querySelector('[role="textbox"]') as HTMLElement;
	expect(surface.getAttribute('aria-multiline')).toBe('false');
});
