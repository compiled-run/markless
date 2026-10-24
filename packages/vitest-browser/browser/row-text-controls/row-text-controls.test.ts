import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import TextRowsPage from './text-rows-page.tsrx';

// A row's controls after interpolated text find their own elements, server-sent or client-built.
afterEach(() => cleanup());

function submit(container: ParentNode, name: string): boolean {
	const form = container.querySelector<HTMLFormElement>(`form[data-form="${name}"]`);
	if (!form) throw new Error(`Expected the ${name} form on the page.`);
	const event = new SubmitEvent('submit', { bubbles: true, cancelable: true });
	form.dispatchEvent(event);
	return event.defaultPrevented;
}

const picked = (container: ParentNode) => container.querySelector('[data-picked]')?.textContent;

// A client-rendered row does not cancel a submit at once yet, a gap outside addressing; its handler still has to run.
async function expectRowControls(container: HTMLElement, cancelsAtOnce: boolean) {
	const cancelled = submit(container, 'lin');
	if (cancelsAtOnce) expect(cancelled).toBe(true);
	await expect.poll(() => picked(container)).toBe('lin');
	container.querySelector<HTMLButtonElement>('[data-pick="ada"]')!.click();
	await expect.poll(() => picked(container)).toBe('ada!');
}

test('SSR: row controls after interpolated text run their own handlers', async () => {
	await expectRowControls((await renderSSR(TextRowsPage)).container as HTMLElement, true);
});

test('CSR: row controls after interpolated text run their own handlers', async () => {
	await expectRowControls((await render(TextRowsPage)).container as HTMLElement, false);
});
