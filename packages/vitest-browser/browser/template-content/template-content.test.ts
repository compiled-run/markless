import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSRPhased } from '../../src/index.ts';
import ForeignObjectPage from './foreign-object-page.tsrx';
import NoscriptPage from './noscript-page.tsrx';
import TemplatePage from './template-page.tsrx';

afterEach(cleanup);

async function clickTwice(container: Element, selector: string) {
	const button = container.querySelector<HTMLButtonElement>(selector)!;
	button.click();
	await expect.poll(() => button.textContent).toBe('1');
	button.click();
	await expect.poll(() => button.textContent).toBe('2');
}

test('SSR: a <template> with element children leaves later handlers wired', async () => {
	const { mount } = await renderSSRPhased(TemplatePage);
	const screen = mount();
	expect(
		screen.container.querySelector('template')!.content.querySelectorAll('span'),
	).toHaveLength(2);
	await clickTwice(screen.container, '[data-bump]');
});

test('SSR: <noscript> element content leaves later handlers wired', async () => {
	const { mount } = await renderSSRPhased(NoscriptPage);
	const screen = mount();
	await clickTwice(screen.container, '[data-bump]');
});

test('SSR: handlers inside <svg><foreignObject> and after a <template> both stay wired', async () => {
	const { mount } = await renderSSRPhased(ForeignObjectPage);
	const screen = mount();
	await clickTwice(screen.container, '[data-inner]');
	await clickTwice(screen.container, '[data-outer]');
});
