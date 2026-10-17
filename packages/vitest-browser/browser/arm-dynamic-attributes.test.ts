import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import ArmDynamicAttributes from './fixtures/arm-dynamic-attributes.tsrx';
import logo from './fixtures/arm-logo.svg';

// An @if arm rebuilds from graph reads, so module values (imports, consts) it shows must survive the flip.
afterEach(() => cleanup());

function click(container: ParentNode, selector: string) {
	container.querySelector<HTMLElement>(selector)?.click();
}

async function expectArmAttributes(container: HTMLElement) {
	const attribute = (selector: string, name: string) =>
		container.querySelector(selector)?.getAttribute(name);
	expect(container.querySelector('[data-menu]')).toBeNull();
	click(container, '[data-toggle]');
	await expect.poll(() => container.querySelector('[data-menu]')?.className).toBe('calm');
	expect(attribute('[data-link]', 'href')).toBe('/docs/calm');
	expect(attribute('[data-home]', 'href')).toBe('/docs/');
	expect(attribute('[data-home]', 'title')).toBe('beta');
	expect(attribute('[data-logo]', 'src')).toBe(logo);
	expect(attribute('[data-pic]', 'src')).toBe(logo);
	expect(container.querySelector('[data-badge]')?.textContent).toBe('beta');
	expect(container.querySelector('[data-tag]')?.textContent).toBe('calm');
	click(container, '[data-tone]');
	await expect.poll(() => container.querySelector('[data-menu]')?.className).toBe('loud');
	expect(attribute('[data-link]', 'href')).toBe('/docs/loud');
	expect(container.querySelector('[data-tag]')?.textContent).toBe('loud');
	click(container, '[data-toggle]');
	await expect.poll(() => container.querySelector('[data-menu]')).toBeNull();
	click(container, '[data-toggle]');
	await expect.poll(() => attribute('[data-logo]', 'src')).toBe(logo);
}

test('CSR: an @if arm holds a component, state bindings and module-value attributes', async () => {
	const screen = await render(ArmDynamicAttributes);
	await expectArmAttributes(screen.container as HTMLElement);
});

test('SSR: an @if arm holds a component, state bindings and module-value attributes', async () => {
	const screen = await renderSSR(ArmDynamicAttributes);
	await expectArmAttributes(screen.container as HTMLElement);
});
