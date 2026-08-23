import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import AltPage from './fixtures/ehv-alt-page.tsrx';
import SelfPage from './fixtures/ehv-self.tsrx';
import SharedPage from './fixtures/ehv-shared-page.tsrx';
import ValuePage from './fixtures/ehv-value.tsrx';

// An element() handle is a VALUE wherever a handler can read one: on the element
// that binds it, through a shared() instance member, and passed into a plain
// function. Every one of these read `undefined` before this witness existed.
afterEach(() => cleanup());

function selfButton(container: ParentNode) {
	const node = container.querySelector<HTMLButtonElement>('[data-ehv-self]');
	if (!node) throw new Error('Expected the self-bound button.');
	return node;
}

function selfFieldPair(container: ParentNode) {
	const field = container.querySelector<HTMLInputElement>('[data-ehv-self-field]');
	const focus = container.querySelector<HTMLButtonElement>('[data-ehv-self-focus]');
	if (!field || !focus) throw new Error('Expected the field and its focus button.');
	return { field, focus };
}

function altParts(container: ParentNode) {
	const plain = container.querySelector<HTMLElement>('[data-ehv-alt-plain]');
	const plainPoke = container.querySelector<HTMLElement>('[data-ehv-alt-plain-poke]');
	const surface = container.querySelector<HTMLElement>('[data-ehv-alt-surface]');
	const poke = container.querySelector<HTMLElement>('[data-ehv-alt-poke]');
	if (!plain || !plainPoke || !surface || !poke) throw new Error('Expected every alt part.');
	return { plain, plainPoke, surface, poke };
}

function sharedParts(container: ParentNode) {
	const panel = container.querySelector<HTMLElement>('[data-ehv-shared-panel]');
	const trigger = container.querySelector<HTMLButtonElement>('[data-ehv-shared-trigger]');
	if (!panel || !trigger) throw new Error('Expected the shared panel and trigger.');
	return { panel, trigger };
}

function valueParts(container: ParentNode) {
	const panel = container.querySelector<HTMLElement>('[data-ehv-value-panel]');
	const trigger = container.querySelector<HTMLButtonElement>('[data-ehv-value-trigger]');
	if (!panel || !trigger) throw new Error('Expected the value panel and trigger.');
	return { panel, trigger };
}

test('CSR: a handle bound on an element resolves inside that element own handler', async () => {
	const screen = await render(SelfPage);
	const button = selfButton(screen.container as HTMLElement);

	expect(button.getAttribute('data-self-hit')).toBeNull();
	button.click();
	await expect.poll(() => button.getAttribute('data-self-hit')).toBe('yes');
});

test('SSR resume: the self-bound handle resolves in the resumed handler', async () => {
	const screen = await renderSSR(SelfPage);
	const button = selfButton(screen.container as HTMLElement);

	expect(button.getAttribute('data-self-hit')).toBeNull();
	button.click();
	await expect.poll(() => button.getAttribute('data-self-hit')).toBe('yes');
});

test('CSR: the spec SearchBox shape focuses the field from another button', async () => {
	const screen = await render(SelfPage);
	const { field, focus } = selfFieldPair(screen.container as HTMLElement);

	expect(document.activeElement).not.toBe(field);
	focus.click();
	await expect.poll(() => document.activeElement).toBe(field);
});

test('SSR resume: the SearchBox shape focuses the served field after resume', async () => {
	const screen = await renderSSR(SelfPage);
	const { field, focus } = selfFieldPair(screen.container as HTMLElement);

	expect(document.activeElement).not.toBe(field);
	focus.click();
	await expect.poll(() => document.activeElement).toBe(field);
});

test('CSR: a shared() instance handle resolves in a sibling part handler', async () => {
	const screen = await render(SharedPage);
	const { panel, trigger } = sharedParts(screen.container as HTMLElement);

	expect(panel.getAttribute('data-shared-hit')).toBeNull();
	trigger.click();
	await expect.poll(() => panel.getAttribute('data-shared-hit')).toBe('yes');
});

test('SSR resume: a shared() instance handle resolves after resume', async () => {
	const screen = await renderSSR(SharedPage);
	const { panel, trigger } = sharedParts(screen.container as HTMLElement);

	expect(panel.getAttribute('data-shared-hit')).toBeNull();
	trigger.click();
	await expect.poll(() => panel.getAttribute('data-shared-hit')).toBe('yes');
});

test('CSR: a handle passed as a value reaches an imported plain function', async () => {
	const screen = await render(ValuePage);
	const { panel, trigger } = valueParts(screen.container as HTMLElement);

	expect(panel.getAttribute('data-opened')).toBeNull();
	trigger.click();
	await expect.poll(() => panel.getAttribute('data-opened')).toBe('yes');
});

test('SSR resume: a handle passed as a value survives resume', async () => {
	const screen = await renderSSR(ValuePage);
	const { panel, trigger } = valueParts(screen.container as HTMLElement);

	expect(panel.getAttribute('data-opened')).toBeNull();
	trigger.click();
	await expect.poll(() => panel.getAttribute('data-opened')).toBe('yes');
});

// Hardcoding resistance: the same two patterns with every name, tag, attribute,
// argument slot, and source order changed. Nothing about the lowering may depend
// on how the first fixtures happened to be spelled.
test('CSR: the alternate spelling resolves both a local and an instance handle', async () => {
	const screen = await render(AltPage);
	const { plain, plainPoke, surface, poke } = altParts(screen.container as HTMLElement);

	plainPoke.click();
	await expect.poll(() => plain.getAttribute('ehv-reason')).toBe('local');
	expect(document.activeElement).toBe(plain);

	poke.click();
	await expect.poll(() => surface.getAttribute('ehv-reason')).toBe('member');
	expect(document.activeElement).toBe(surface);
});

test('SSR resume: the alternate spelling resolves both handles after resume', async () => {
	const screen = await renderSSR(AltPage);
	const { plain, plainPoke, surface, poke } = altParts(screen.container as HTMLElement);

	plainPoke.click();
	await expect.poll(() => plain.getAttribute('ehv-reason')).toBe('local');
	expect(document.activeElement).toBe(plain);

	poke.click();
	await expect.poll(() => surface.getAttribute('ehv-reason')).toBe('member');
	expect(document.activeElement).toBe(surface);
});
