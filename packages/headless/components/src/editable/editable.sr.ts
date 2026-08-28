import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { type Conveys, missingFacts, readUntil } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import Empty from './scenarios/empty.tsrx';
import Locked from './scenarios/locked.tsrx';

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

// The whole reason the preview is a `<button>` and not Ark's focusable span: a
// reader has to hear BOTH the words and the fact that they can be changed. A
// span with an `aria-label` of "edit" says the second and drops the first.
test('the value reaches a reader as a button carrying its own words', async () => {
	await open(Basic);
	expectConveysFacts(await readUntil(sr, { role: 'button', name: 'Quarterly plan' }), {
		role: 'button',
		name: 'Quarterly plan',
	});
});

// The placeholder is not decoration: with an empty value it is the only thing
// giving that button an accessible name at all.
test('an empty value reaches a reader through the placeholder', async () => {
	await open(Empty);
	expectConveysFacts(await readUntil(sr, { role: 'button', name: 'Name this list' }), {
		role: 'button',
		name: 'Name this list',
	});
});

test('a value nobody may edit conveys that its control is unavailable', async () => {
	await open(Locked);
	expectConveysFacts(await readUntil(sr, { role: 'button', name: 'frozen' }), {
		role: 'button',
		name: 'frozen',
		state: ['disabled'],
	});
});

// Read-only is announced the same way, and deliberately: `aria-readonly` is not
// an attribute `button` supports, so the state a reader can actually hear is the
// disabled one - while the control stays focusable and its words stay readable.
test('a read-only value is still reachable and conveys that it is unavailable', async () => {
	await open(Locked);
	expectConveysFacts(await readUntil(sr, { role: 'button', name: 'published' }), {
		role: 'button',
		name: 'published',
		state: ['disabled'],
	});
});

test('the field a session opens is announced with the name its label gives it', async () => {
	const { container } = await render(Basic);
	const scope = container as unknown as HTMLElement;
	await sr.start(scope);
	const trigger = scope.querySelector('[data-testid="trigger"]') as HTMLButtonElement;
	trigger.click();
	const field = scope.querySelector('[data-testid="input"]') as HTMLInputElement;
	await expect.poll(() => field.hidden).toBe(false);

	expectConveysFacts(await readUntil(sr, { role: 'textbox', name: 'Document name' }), {
		role: 'textbox',
		name: 'Document name',
	});
});
