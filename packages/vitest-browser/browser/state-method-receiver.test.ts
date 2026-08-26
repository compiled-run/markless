import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Page from './fixtures/state-method-receiver.tsrx';

// A non-mutating method called directly on a state array used to lower to
// `read(id, ["filter"])(...)` - a detached Array.prototype function invoked with
// no receiver - so the first click in a resumed handler threw
// "Array.prototype.filter called on null or undefined".
afterEach(() => cleanup());

const keys = (container: ParentNode) => container.querySelector('[data-keys]')?.textContent;
const note = (container: ParentNode) => container.querySelector('[data-note]')?.textContent;
const press = (container: ParentNode, name: string) => {
	const button = container.querySelector<HTMLButtonElement>(`[data-${name}]`);
	if (!button) throw new Error(`Expected a "${name}" button.`);
	button.click();
};

async function expectMethodsKeepTheirReceiver(container: ParentNode) {
	expect(keys(container)).toBe('north,south,east');

	press(container, 'filter');
	await expect.poll(() => keys(container)).toBe('north,east');

	press(container, 'concat');
	await expect.poll(() => keys(container)).toBe('north,east,west');

	press(container, 'computed');
	await expect.poll(() => note(container)).toBe('North|East|West');

	press(container, 'spread');
	await expect.poll(() => keys(container)).toBe('east,west');

	press(container, 'slice');
	await expect.poll(() => keys(container)).toBe('east');
}

test('CSR: a method call on a state array keeps its receiver', async () => {
	const screen = await render(Page);
	await expectMethodsKeepTheirReceiver(screen.container as HTMLElement);
});

test('SSR resume: a method call on a state array keeps its receiver', async () => {
	const screen = await renderSSR(Page);
	await expectMethodsKeepTheirReceiver(screen.container);
});
