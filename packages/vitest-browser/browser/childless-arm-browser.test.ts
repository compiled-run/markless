import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR, renderSSRPhased } from '../src/index.ts';
import Page from './fixtures/cbranch-page.tsrx';

// Cross-module namespace parts whose bodies branch on `children`, served through
// the vite transform. A self-closed placement must serve its `@else` arm and a
// written-into one must serve the projection; the silent failure this pins is a
// branch site served with neither arm filled while attributes on the same
// element stay correct. `barelabel` is the shape that failed: both arms are bare
// `{expr}` interpolations with no element of their own.
afterEach(() => cleanup());

function widget(container: ParentNode, name: string) {
	const host = container.querySelector(`[data-widget="${name}"]`);
	if (!host) throw new Error(`Expected widget "${name}".`);
	return {
		value: host.querySelector<HTMLElement>('[data-cb-value]'),
		staticLabel: host.querySelector<HTMLElement>('[data-cb-static]'),
		bare: host.querySelector<HTMLElement>('[data-cb-bare]'),
		bump: host.querySelector<HTMLButtonElement>('[data-cb-bump]'),
	};
}

function expectArmsFilled(container: ParentNode) {
	const self = widget(container, 'self');
	const written = widget(container, 'written');

	// Attributes were already live while the arms were empty; they are the
	// control, not the finding.
	expect(self.value?.getAttribute('ui-value')).toBe('40');
	expect(self.bare?.getAttribute('ui-value')).toBe('40');

	expect(self.value?.querySelector('[data-cb-own]')?.textContent).toBe('40');
	expect(self.value?.textContent).toBe('40');
	expect(self.staticLabel?.querySelector('[data-cb-static-own]')?.textContent).toBe('own');
	expect(self.staticLabel?.textContent).toBe('own');
	expect(self.bare?.textContent).toBe('40');

	expect(written.value?.querySelector('[data-cb-own]')).toBeNull();
	expect(written.value?.textContent).toBe('custom');
	expect(written.staticLabel?.querySelector('[data-cb-static-own]')).toBeNull();
	expect(written.staticLabel?.textContent).toBe('written');
	expect(written.bare?.textContent).toBe('bare');
}

async function expectBareArmRefreshes(container: ParentNode) {
	widget(container, 'self').bump?.click();

	await expect.poll(() => widget(container, 'self').bare?.textContent).toBe('41');
	// The other widget holds its own shared instance.
	expect(widget(container, 'written').bare?.textContent).toBe('bare');
}

test('CSR: a self-closed namespace part serves its own arm; a written-into one serves children', async () => {
	const screen = await render(Page);
	expectArmsFilled(screen.container as HTMLElement);
});

test('CSR: a bare-expression arm refreshes when the value behind it changes', async () => {
	const screen = await render(Page);
	await expectBareArmRefreshes(screen.container as HTMLElement);
});

test('SSR: the server HTML carries every arm, filled', async () => {
	const phased = await renderSSRPhased(Page);

	expect(phased.html).toContain('own');
	expect(phased.html).toContain('custom');
	expect(phased.html).toContain('written');
	expect(phased.html).toContain('bare');
	// The failure shape: an arm pair with nothing between the two markers.
	expect(phased.html).not.toMatch(/<!--markless:branch:[^>]*--><!--\/markless:branch:/);

	expectArmsFilled(phased.mount().container);
});

test('SSR resume: the arms survive resume and stay live', async () => {
	const screen = await renderSSR(Page);
	expectArmsFilled(screen.container);
	await expectBareArmRefreshes(screen.container);
});
