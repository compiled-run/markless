import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import ArmBrowserRenderPage from './arm-browser-render-page.tsrx';
import ArmRowAttributePage from './arm-row-attribute-page.tsrx';

afterEach(() => cleanup());

const html = (container: ParentNode, id: string) =>
	(container.querySelector(`#${id}`)?.innerHTML ?? '').replace(/<!--[^>]*-->/g, '');

for (const mode of ['SSR', 'CSR'] as const)
	test(`${mode}: an @if arm holding components renders them when it opens, and their handlers run`, async () => {
		const { container } = await (mode === 'SSR' ? renderSSR(ArmBrowserRenderPage) : render(ArmBrowserRenderPage));
		const hits = globalThis as { noticeHits?: number; localHits?: number };
		hits.noticeHits = 0;
		hits.localHits = 0;
		expect(html(container, 'imported')).toBe('<i>closed</i>');
		container.querySelector<HTMLButtonElement>('[data-toggle]')!.click();
		await expect.poll(() => html(container, 'imported')).toContain('<h2>Imported</h2>');
		await expect.poll(() => html(container, 'local')).toContain('<h2>Local</h2>');
		expect(html(container, 'imported-glyph')).toContain('width="12"');
		expect(html(container, 'local-glyph')).toContain('width="12"');
		container.querySelector<HTMLButtonElement>('[data-go]')!.click();
		await expect.poll(() => hits.noticeHits).toBe(1);
		container.querySelector<HTMLButtonElement>('[data-local-go]')!.click();
		await expect.poll(() => hits.localHits).toBe(1);
		container.querySelector<HTMLElement>('[data-counter]')!.click();
		await expect.poll(() => container.querySelector('[data-counter]')?.textContent).toBe('n1');
		container.querySelector<HTMLElement>('[data-counter]')!.click();
		await expect.poll(() => container.querySelector('[data-counter]')?.textContent).toBe('n2');
		container.querySelector<HTMLButtonElement>('[data-toggle]')!.click();
		await expect.poll(() => html(container, 'imported')).toBe('<i>closed</i>');
		expect(container.querySelector('[data-counter]')).toBeNull();
		container.querySelector<HTMLButtonElement>('[data-toggle]')!.click();
		await expect.poll(() => html(container, 'imported')).toContain('<h2>Imported</h2>');
		container.querySelector<HTMLButtonElement>('[data-go]')!.click();
		await expect.poll(() => hits.noticeHits).toBe(2);
		expect(container.querySelector('[data-counter]')?.textContent).toBe('n0');
		container.querySelector<HTMLElement>('[data-counter]')!.click();
		await expect.poll(() => container.querySelector('[data-counter]')?.textContent).toBe('n1');
	});

for (const mode of ['SSR', 'CSR'] as const)
	test(`${mode}: a keyed @for in an @if arm whose rows bind an attribute builds, flips and keeps the attribute`, async () => {
		const { container } = await (mode === 'SSR' ? renderSSR(ArmRowAttributePage) : render(ArmRowAttributePage));
		const ids = () => [...container.querySelectorAll('main p')].map((row) => `${row.id}:${row.textContent}`).join(',');
		expect(ids()).toBe('a:a,b:b');
		container.querySelector<HTMLButtonElement>('button')!.click();
		await expect.poll(ids).toBe('');
		container.querySelector<HTMLButtonElement>('button')!.click();
		await expect.poll(ids).toBe('a:a,b:b');
	});

