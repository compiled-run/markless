import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './acp-page.tsrx';

afterEach(cleanup);

const icon = () => document.querySelector('[data-theme] svg');
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

async function pinArmsRebuildWithTheirProps() {
	expect(icon()?.getAttribute('data-icon')).toBe('sun');
	expect(icon()?.getAttribute('width')).toBe('13');
	expect(icon()?.getAttribute('aria-label')).toBe('light "on"');
	click('[data-theme]');
	await expect.poll(() => icon()?.getAttribute('data-icon')).toBe('moon');
	expect(icon()?.getAttribute('width')).toBe('15');
	expect(icon()?.getAttribute('height')).toBeNull();
	expect(icon()?.getAttribute('aria-hidden')).toBe('true');
	await expect.poll(() => document.querySelector('[data-badge]')?.className).toBe('calm');
	expect(document.querySelector('[data-badge]')?.getAttribute('title')).toBe('night');
	click('[data-tone]');
	await expect.poll(() => document.querySelector('[data-badge]')?.className).toBe('loud');
	click('[data-theme]');
	await expect.poll(() => icon()?.getAttribute('data-icon')).toBe('sun');
	expect(icon()?.getAttribute('height')).toBe('13');
	expect(document.querySelector('[data-local]')?.textContent).toBe('day');
}

test('CSR: an @if arm holding imported components with constant props flips', async () => {
	await render(Page);
	await pinArmsRebuildWithTheirProps();
});

test('SSR: an @if arm holding imported components with constant props flips', async () => {
	await renderSSR(Page);
	await pinArmsRebuildWithTheirProps();
});
