import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { api, installApi } from './api.ts';
import { ClearPage } from './clear-page.tsrx';
import { QuietFailPage } from './quiet-fail-page.tsrx';
import { TypedPage } from './typed-page.tsrx';

// An input shows a loaded value, the person types over it, and the save fails: what was typed stays.

installApi();
afterEach(() => cleanup());

const field = (container: ParentNode) => container.querySelector<HTMLInputElement>('input[name=first]')!;

async function typeAndSave(container: HTMLElement, loaded: string): Promise<number> {
	await expect.poll(() => field(container)?.value).toBe(loaded);
	const loads = api.loads;
	field(container).value = 'Typed';
	field(container).dispatchEvent(new Event('input', { bubbles: true }));
	container.querySelector<HTMLButtonElement>('[data-submit]')!.click();
	return loads;
}

const settled = async (container: HTMLElement) => {
	await expect.poll(() => container.querySelectorAll('[aria-busy], [aria-disabled]').length).toBe(0);
	await new Promise((resolve) => setTimeout(resolve, 50));
};

const throwing = { CSR: () => render(TypedPage), SSR: () => renderSSR(TypedPage) };
const clearing = { CSR: () => render(ClearPage), SSR: () => renderSSR(ClearPage) };
const quiet = { CSR: () => render(QuietFailPage), SSR: () => renderSSR(QuietFailPage) };

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: a handler whose save fails shows @catch and keeps the typed text`, async () => {
		const { container } = await throwing[mode]();
		await typeAndSave(container as HTMLElement, 'Ada a1');
		await expect.poll(() => container.querySelector('[data-caught]')?.textContent).toBe('Saving failed (500)');
		await settled(container as HTMLElement);
		expect(field(container).value).toBe('Typed');
	});

	test(`${mode}: a save that answers 500 and a handler that goes on keeps the typed text`, async () => {
		const { container } = await quiet[mode]();
		const loads = await typeAndSave(container as HTMLElement, 'Ada b2');
		await expect.poll(() => container.querySelector('[data-note]')?.textContent).toBe('refused');
		await settled(container as HTMLElement);
		expect(field(container).value).toBe('Typed');
		expect(api.loads, 'a failed save loads nothing again').toBe(loads);
	});

	test(`${mode}: a state written back to the value the field was drawn with still clears what was typed`, async () => {
		const { container } = await clearing[mode]();
		const draft = () => container.querySelector<HTMLInputElement>('input[name=draft]')!;
		draft().value = 'abc';
		draft().dispatchEvent(new Event('input', { bubbles: true }));
		await new Promise((resolve) => setTimeout(resolve, 50));
		container.querySelector<HTMLButtonElement>('[data-clear]')!.click();
		await expect.poll(() => draft().value).toBe('');
	});
}
