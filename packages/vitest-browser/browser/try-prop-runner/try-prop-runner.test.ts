import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import GrovePage from './tpr-grove.tsrx';
import ShadowPage from './tpr-shadow.tsrx';

afterEach(() => cleanup());

const limbs = (container: unknown) =>
	[...(container as HTMLElement).querySelectorAll('.limb')].map((limb) =>
		[...limb.childNodes]
			.filter((node) => node.nodeType === 3)
			.map((node) => node.textContent)
			.join('')
			.trim(),
	);

async function pinFold(container: unknown) {
	(container as HTMLElement).querySelector<HTMLElement>('.fold')!.click();
	await expect
		.poll(() => (container as HTMLElement).querySelector('.fold')?.textContent)
		.toBe('[+]');
}

test('CSR: an @try settles when its arm hands the async value to a child prop of the same name', async () => {
	const screen = await render(ShadowPage);
	await expect.poll(() => limbs(screen.container)).toEqual(['trunk']);
	await pinFold(screen.container);
});

test('SSR: an @try serves settled when its arm hands the async value to a child prop of the same name', async () => {
	const screen = await renderSSR(ShadowPage);
	expect(limbs(screen.container)).toEqual(['trunk']);
	await pinFold(screen.container);
});

test('SSR: a component that renders itself inside its own @try serves every level', async () => {
	const screen = await renderSSR(GrovePage);
	expect(limbs(screen.container)).toEqual(['trunk', 'bough', 'leaf', 'sprig']);
});
