import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import App from './fixtures/scoped-keyframes.tsrx';

// Two components declare `@keyframes fade-out` with different frames; each must end on its own.
afterEach(() => cleanup());

function expectOwnFinalFrames(container: ParentNode): void {
	const popup = container.querySelector<HTMLElement>('[data-popup]')!;
	const erased = container.querySelector<HTMLElement>('[data-erased]')!;
	expect(getComputedStyle(popup).opacity).toBe('0.25');
	expect(getComputedStyle(erased).opacity).toBe('0');
	expect(getComputedStyle(popup).animationName).not.toBe(getComputedStyle(erased).animationName);
}

test('CSR: each component animation ends on its own keyframes', async () => {
	const screen = await render(App);
	expectOwnFinalFrames(screen.container as HTMLElement);
});

test('SSR: each component animation ends on its own keyframes in the served page', async () => {
	const screen = await renderSSR(App);
	expectOwnFinalFrames(screen.container);
});
