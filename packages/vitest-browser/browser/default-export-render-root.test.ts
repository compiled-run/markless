import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import DefaultRootLayout from './fixtures/default-root-layout.tsrx';
import DefaultRootPage from './fixtures/default-root-page.tsrx';

// A module rendered whole renders its default export, not a named export written above it.
afterEach(() => cleanup());

async function expectFrameAroundShell(container: HTMLElement) {
	const frame = container.querySelector('section.frame[data-frame]');
	expect(frame).not.toBeNull();
	expect(frame?.querySelector('div.shell[data-shell]')).not.toBeNull();
	const button = frame!.querySelector<HTMLButtonElement>('button[data-open]')!;
	button.click();
	await expect.poll(() => button.textContent).toBe('1');
}

test('SSR: the layout module renders its default export with its own outer element', async () => {
	const screen = await renderSSR(DefaultRootLayout);
	await expectFrameAroundShell(screen.container as HTMLElement);
});

test('CSR: the layout module renders its default export with its own outer element', async () => {
	const screen = await render(DefaultRootLayout);
	await expectFrameAroundShell(screen.container as HTMLElement);
});

async function expectComposedPage(container: HTMLElement) {
	expect(container.querySelector('section.frame > div.shell > p[data-body]')?.textContent).toBe(
		'Body',
	);
	expect(container.querySelector('main > div.shell > p[data-loose]')?.textContent).toBe('Loose');
	await expectFrameAroundShell(container);
}

test('SSR: a page composing both the default and the named export renders each', async () => {
	const screen = await renderSSR(DefaultRootPage);
	await expectComposedPage(screen.container as HTMLElement);
});

test('CSR: a page composing both the default and the named export renders each', async () => {
	const screen = await render(DefaultRootPage);
	await expectComposedPage(screen.container as HTMLElement);
});
