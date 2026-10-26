import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { TemplateImportPage } from './template-import-page.tsrx';

afterEach(() => cleanup());

async function loadsBothPanels(container: HTMLElement) {
	const output = () => container.querySelector('[data-o]')?.textContent;
	container.querySelector<HTMLButtonElement>('[data-load]')!.click();
	await expect.poll(output).toBe('north panel');
	container.querySelector<HTMLButtonElement>('[data-south]')!.click();
	await expect.poll(() => container.querySelector('[data-side]')?.textContent).toBe('south');
	container.querySelector<HTMLButtonElement>('[data-load]')!.click();
	await expect.poll(output).toBe('south panel');
}

test("browser render: a handler's import() with a template path resolves beside the authoring file", async () => {
	await loadsBothPanels((await render(TemplateImportPage)).container as HTMLElement);
});

test("server render + resume: a handler's import() with a template path resolves beside the authoring file", async () => {
	await loadsBothPanels((await renderSSR(TemplateImportPage)).container as HTMLElement);
});
