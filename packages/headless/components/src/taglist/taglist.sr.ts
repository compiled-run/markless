import { render } from '@markless/vitest-browser';
import { userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import DisplayOnly from './scenarios/display-only.tsrx';

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

// The family carries no collection role, so what a reader lands on for each chip
// is the delete button - and the tag's own words have to be in its name, or the
// row is a wall of identically-named buttons.
test('every tag reaches a reader as a button named with the tag it removes', async () => {
	await open(Basic);
	expectConveysFacts(await readUntil(sr, { role: 'button', name: 'Remove alpha' }), {
		role: 'button',
		name: 'Remove alpha',
	});
	expectConveysFacts(await readUntil(sr, { role: 'button', name: 'Remove beta' }), {
		role: 'button',
		name: 'Remove beta',
	});
});

test('the field is announced with the name its label gives it', async () => {
	await open(Basic);
	expectConveysFacts(await readUntil(sr, { role: 'textbox', name: 'Topics' }), {
		role: 'textbox',
		name: 'Topics',
	});
});

// A display-only row has no field at all, so this is the only route in.
test('a row with no field still reaches a reader through its delete buttons', async () => {
	await open(DisplayOnly);
	expectConveysFacts(await readUntil(sr, { role: 'button', name: 'Remove green' }), {
		role: 'button',
		name: 'Remove green',
	});
});

test('a tag nobody may remove conveys that its button is unavailable', async () => {
	await open(Disabled);
	expectConveysFacts(await readUntil(sr, { role: 'button', name: 'Remove locked' }), {
		role: 'button',
		name: 'Remove locked',
		state: ['disabled'],
	});
});

// The live region is this family's guarantee, not an enhancement: with no
// collection role and no aria-activedescendant it is the only channel that says
// a tag went away.
test('a removal reaches the live region the root always renders', async () => {
	const { container } = await render(Basic);
	const scope = container as unknown as HTMLElement;
	await sr.start(scope);
	const close = scope.querySelector('[data-testid="itemclose-alpha"]') as HTMLButtonElement;
	close.click();
	const region = scope.querySelector('output[aria-live]') as HTMLElement;
	await expect.poll(() => region.textContent).toBe('alpha removed');
});

test('a committed tag reaches the same live region', async () => {
	const { container } = await render(Basic);
	const scope = container as unknown as HTMLElement;
	await sr.start(scope);
	const field = scope.querySelector('[data-testid="input"]') as HTMLInputElement;
	field.focus();
	await userEvent.keyboard('gamma,');
	const region = scope.querySelector('output[aria-live]') as HTMLElement;
	await expect.poll(() => region.textContent).toBe('gamma added');
});
