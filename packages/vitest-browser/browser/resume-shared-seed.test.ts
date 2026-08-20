import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Page from './fixtures/seedchk-page.tsrx';

// U-L: a widget root seeds its shared instance from its own prop, and the seed
// has to survive an SSR resume. The "on" widget is seeded `true`, which is NOT
// the factory's placeholder, so the first gesture after resume can only reach
// `false` if the payload carried the seeded cell rather than the placeholder.
afterEach(() => cleanup());

function widget(container: ParentNode, name: string) {
	const host = container.querySelector(`[data-widget="${name}"]`);
	if (!host) throw new Error(`Expected widget "${name}".`);
	return {
		root: host.querySelector('[data-seed-root]') as HTMLElement,
		trigger: host.querySelector<HTMLButtonElement>('[data-seed-trigger]'),
		indicator: host.querySelector('[data-seed-indicator]'),
	};
}

function expectSeededRender(container: ParentNode) {
	expect(widget(container, 'on').indicator?.textContent).toBe('true');
	expect(widget(container, 'on').root.hasAttribute('ui-checked')).toBe(true);
	expect(widget(container, 'off').indicator?.textContent).toBe('false');
	expect(widget(container, 'off').root.hasAttribute('ui-checked')).toBe(false);
}

// The seeded widget goes ON -> OFF on its first click; its neighbour, seeded
// from the placeholder, goes OFF -> ON. One click each, so a widget whose state
// silently fell back to the placeholder moves the wrong way.
async function expectFirstClickInverts(container: ParentNode) {
	widget(container, 'on').trigger?.click();
	await expect.poll(() => widget(container, 'on').indicator?.textContent).toBe('false');
	expect(widget(container, 'off').indicator?.textContent).toBe('false');

	widget(container, 'off').trigger?.click();
	await expect.poll(() => widget(container, 'off').indicator?.textContent).toBe('true');
	expect(widget(container, 'on').indicator?.textContent).toBe('false');
}

test('CSR: a seeded widget renders its seed and its first click inverts it', async () => {
	const screen = await render(Page);
	expectSeededRender(screen.container as HTMLElement);
	await expectFirstClickInverts(screen.container as HTMLElement);
});

test('SSR resume: a seeded widget resumes holding the seed, not the placeholder', async () => {
	const screen = await renderSSR(Page);
	expectSeededRender(screen.container);
	await expectFirstClickInverts(screen.container);
});
