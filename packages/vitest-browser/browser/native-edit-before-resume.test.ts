import { cleanup, renderSSR } from '../src/index.ts';
import { afterEach, expect, test } from 'vitest';
import App from './fixtures/native-edit-before-resume.tsrx';

// A browser default action (Backspace deleting a contenteditable="false" chip) can remove elements
// after the first event starts resume but before the runtime resolves its DOM-order locators.
afterEach(cleanup);

test('SSR: an element removed after the first event does not shift resume locators', async () => {
	const errors: unknown[] = [];
	const onRejection = (event: PromiseRejectionEvent) => errors.push(event.reason);
	window.addEventListener('unhandledrejection', onRejection);
	try {
		const screen = await renderSSR(App);
		const container = screen.container as HTMLElement;
		const bump = container.querySelector('[data-bump]') as HTMLButtonElement;

		bump.click();
		container.querySelector('[data-chip]')!.remove();

		await expect.poll(() => bump.textContent).toBe('bump 1');
		bump.click();
		await expect.poll(() => bump.textContent).toBe('bump 2');
		expect(errors).toEqual([]);
	} finally {
		window.removeEventListener('unhandledrejection', onRejection);
	}
});
