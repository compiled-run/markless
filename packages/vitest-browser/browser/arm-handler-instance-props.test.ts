import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Framed from './arm-handler-instance-props/framed.tsrx';
import Page from './arm-handler-instance-props/page.tsrx';

afterEach(() => cleanup());

// A handler inside a branch arm reads the props of the instance it was rendered in, in either arm.
async function eachInstanceReadsItsOwnProp(container: HTMLElement, arm: string) {
	expect(
		[...container.querySelectorAll('[data-pick]')].map((button) => button.textContent),
	).toEqual([`${arm} dark`, `${arm} light`]);
	container.querySelector<HTMLButtonElement>('[data-pick="dark"]')!.click();
	await expect.poll(() => container.querySelector('[data-got="dark"]')?.textContent).toBe('dark');
	container.querySelector<HTMLButtonElement>('[data-pick="light"]')!.click();
	await expect
		.poll(() => container.querySelector('[data-got="light"]')?.textContent)
		.toBe('light');
	expect(container.querySelector('[data-got="dark"]')?.textContent).toBe('dark');
}

test('CSR: an else-arm handler reads its own instance prop', async () => {
	await eachInstanceReadsItsOwnProp((await render(Page)).container as HTMLElement, 'plain');
});
test('SSR resume: an else-arm handler reads its own instance prop', async () => {
	await eachInstanceReadsItsOwnProp((await renderSSR(Page)).container as HTMLElement, 'plain');
});
test('CSR: an if-arm handler reads its own instance prop', async () => {
	await eachInstanceReadsItsOwnProp((await render(Framed)).container as HTMLElement, 'framed');
});
test('SSR resume: an if-arm handler reads its own instance prop', async () => {
	await eachInstanceReadsItsOwnProp((await renderSSR(Framed)).container as HTMLElement, 'framed');
});
