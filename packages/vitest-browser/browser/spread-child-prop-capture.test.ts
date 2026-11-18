import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Arm from './spread-child-prop-capture/arm.tsrx';
import ComputedProp from './spread-child-prop-capture/computed-prop.tsrx';
import DataOnly from './spread-child-prop-capture/data-only.tsrx';
import Page from './spread-child-prop-capture/page.tsrx';
import Single from './spread-child-prop-capture/single.tsrx';

afterEach(() => cleanup());

// A prop handed to an imported child that spreads it onto its button, as a data attribute and inside a handler.
async function eachButtonCarriesItsOwnProp(container: HTMLElement, names: ReadonlyArray<string>) {
	expect(
		[...container.querySelectorAll('button')].map((button) => button.getAttribute('data-to')),
	).toEqual(names);
	for (const name of names) {
		container.querySelector<HTMLButtonElement>(`[data-to="${name}"]`)!.click();
		await expect
			.poll(() => container.querySelector(`[data-got="${name}"]`)?.textContent)
			.toBe(name);
	}
}

test('CSR: two instances hand their own prop to a spreading child', async () => {
	await eachButtonCarriesItsOwnProp((await render(Page)).container as HTMLElement, [
		'dark',
		'light',
	]);
});
test('SSR resume: two instances hand their own prop to a spreading child', async () => {
	await eachButtonCarriesItsOwnProp((await renderSSR(Page)).container as HTMLElement, [
		'dark',
		'light',
	]);
});
test('CSR: one instance hands its prop to a spreading child', async () => {
	await eachButtonCarriesItsOwnProp((await render(Single)).container as HTMLElement, ['dark']);
});
test('SSR resume: one instance hands its prop to a spreading child', async () => {
	await eachButtonCarriesItsOwnProp((await renderSSR(Single)).container as HTMLElement, ['dark']);
});
test('CSR: a prop passed on only as a data attribute', async () => {
	const container = (await render(DataOnly)).container as HTMLElement;
	expect(
		[...container.querySelectorAll('button')].map((button) => button.getAttribute('data-to')),
	).toEqual(['dark', 'light']);
});
test('SSR resume: a prop passed on only as a data attribute', async () => {
	const container = (await renderSSR(DataOnly)).container as HTMLElement;
	expect(
		[...container.querySelectorAll('button')].map((button) => button.getAttribute('data-to')),
	).toEqual(['dark', 'light']);
});
test('CSR: a spreading child inside a branch arm', async () => {
	await eachButtonCarriesItsOwnProp((await render(Arm)).container as HTMLElement, [
		'dark',
		'light',
	]);
});
test('SSR resume: a spreading child inside a branch arm', async () => {
	await eachButtonCarriesItsOwnProp((await renderSSR(Arm)).container as HTMLElement, [
		'dark',
		'light',
	]);
});
test('CSR: an expression prop handed to a spreading child', async () => {
	const container = (await render(ComputedProp)).container as HTMLElement;
	expect([...container.querySelectorAll('button')].map((button) => button.className)).toEqual([
		'toggle toggle-to-dark',
		'toggle toggle-to-light',
	]);
	await eachButtonCarriesItsOwnProp(container, ['dark', 'light']);
});
test('SSR resume: an expression prop handed to a spreading child', async () => {
	const container = (await renderSSR(ComputedProp)).container as HTMLElement;
	expect([...container.querySelectorAll('button')].map((button) => button.className)).toEqual([
		'toggle toggle-to-dark',
		'toggle toggle-to-light',
	]);
	await eachButtonCarriesItsOwnProp(container, ['dark', 'light']);
});
