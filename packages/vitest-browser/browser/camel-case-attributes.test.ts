import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Page from './camel-case-attributes/page.tsrx';

// A camelCase attribute such as strokeWidth reaches the DOM as the attribute it spells, stroke-width.

afterEach(cleanup);

const element = (selector: string) => document.querySelector<SVGElement | HTMLElement>(selector);
const attribute = (selector: string, name: string) => element(selector)?.getAttribute(name) ?? null;
const strokeWidth = (selector: string) => {
	const line = element(selector);
	return line ? getComputedStyle(line).strokeWidth : null;
};

async function camelCaseAttributes() {
	expect(attribute('[data-static]', 'stroke-width')).toBe('4');
	expect(strokeWidth('[data-static]')).toBe('4px');
	expect(attribute('[data-static]', 'fill-opacity')).toBe('0.5');
	expect(attribute('[data-static]', 'strokeWidth')).toBeNull();
	expect(attribute('[data-grow]', 'tabindex')).toBe('0');
	expect(strokeWidth('[data-live]')).toBe('2px');
	expect(attribute('[data-object]', 'stroke-width')).toBe('6');
	expect(attribute('[data-object]', 'stroke-linecap')).toBe('round');
	expect(strokeWidth('[data-object]')).toBe('6px');
	expect(attribute('[data-spread]', 'stroke-width')).toBe('8');
	expect(attribute('[data-spread]', 'stroke-dasharray')).toBe('2 2');
	element('[data-grow]')!.click();
	await expect.poll(() => strokeWidth('[data-live]')).toBe('3px');
	expect(attribute('[data-live]', 'stroke-width')).toBe('3');
	expect(attribute('[data-row="a"]', 'stroke-width')).toBe('5');
	element('[data-add]')!.click();
	await expect.poll(() => strokeWidth('[data-row="b"]')).toBe('7px');
	expect(attribute('[data-row="b"]', 'strokeWidth')).toBeNull();
	element('[data-open]')!.click();
	await expect.poll(() => strokeWidth('[data-arm]')).toBe('3px');
	expect(attribute('[data-arm]', 'strokeWidth')).toBeNull();
}

test('CSR: camelCase SVG and HTML attributes render as their real names', async () => {
	await render(Page);
	await camelCaseAttributes();
});

test('SSR resume: camelCase SVG and HTML attributes render as their real names', async () => {
	await renderSSR(Page);
	await camelCaseAttributes();
});
