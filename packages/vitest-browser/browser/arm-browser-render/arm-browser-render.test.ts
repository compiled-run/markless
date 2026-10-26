import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import ArmBrowserRenderPage from './arm-browser-render-page.tsrx';
import ArmExpressionPage from './arm-expression-page.tsrx';
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
	test(`${mode}: a keyed @for in an @if arm whose rows bind an attribute builds, flips and keeps the attribute and handlers`, async () => {
		const { container } = await (mode === 'SSR' ? renderSSR(ArmRowAttributePage) : render(ArmRowAttributePage));
		const ids = () => [...container.querySelectorAll('main p')].map((row) => `${row.id}:${row.textContent}`).join(',');
		const press = (selector: string) => container.querySelector<HTMLElement>(selector)!.click();
		expect(ids()).toBe('a:a,b:b');
		press('#b');
		await expect.poll(() => container.querySelector('output')?.textContent).toBe('b');
		press('[data-open]');
		await expect.poll(ids).toBe('');
		press('[data-add]');
		press('[data-open]');
		await expect.poll(ids).toBe('a:a,b:b,c:c');
		press('#c');
		await expect.poll(() => container.querySelector('output')?.textContent).toBe('c');
		press('#a');
		await expect.poll(() => container.querySelector('output')?.textContent).toBe('a');
	});

for (const mode of ['SSR', 'CSR'] as const)
	test(`${mode}: attributes an @if arm computes from props and state come back right after a flip`, async () => {
		const { container } = await (mode === 'SSR' ? renderSSR(ArmExpressionPage) : render(ArmExpressionPage));
		const link = (path: string) => {
			const a = container.querySelector(`[data-item="${path}"] a`);
			return a ? `${a.className}|${a.getAttribute('title')}|${a.getAttribute('data-tone')}` : '';
		};
		const press = (path: string, op: string) =>
			container.querySelector<HTMLButtonElement>(`[data-item="${path}"] [data-${op}]`)!.click();
		expect(link('/a')).toBe('x|/a!|cold');
		expect(link('/b')).toBe('y|/b!|cold');
		press('/a', 'hot');
		await expect.poll(() => link('/a')).toBe('x|/a!|hot');
		press('/b', 'open');
		await expect.poll(() => link('/b')).toBe('');
		press('/b', 'hot');
		press('/b', 'open');
		await expect.poll(() => link('/b')).toBe('y|/b!|hot');
		press('/a', 'open');
		await expect.poll(() => link('/a')).toBe('');
		press('/a', 'open');
		await expect.poll(() => link('/a')).toBe('x|/a!|hot');
	});
