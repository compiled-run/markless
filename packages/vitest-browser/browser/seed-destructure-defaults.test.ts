import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR, renderSSRPhased } from '../src/index.ts';
import Page from './fixtures/seed-defaults-page.tsrx';

// Owner ruling (2026-08-20): a component-body assignment always assigns, and a
// part states what an omitted prop means with a destructuring default at its own
// signature. Two widgets of one family prove both cases on one page: a passed
// value and an omitted prop that falls back to the signature default rather than
// to the factory's placeholder. (An explicitly undefined prop takes the same
// path; the emitted-source proof for that lives in the compiler suite, because
// `tone={undefined}` on a component edge is a separate, unrelated gap.)
afterEach(() => cleanup());

function widget(container: ParentNode, name: string) {
	const host = container.querySelector(`[data-widget="${name}"]`);
	if (!host) throw new Error(`Expected widget "${name}".`);
	return {
		root: host.querySelector('[data-sd-root]'),
		readout: host.querySelector<HTMLButtonElement>('[data-sd-readout]'),
	};
}

function expectDefaultsSeeded(container: ParentNode) {
	expect(widget(container, 'passed').root?.getAttribute('data-tone')).toBe('loud');
	expect(widget(container, 'passed').readout?.getAttribute('data-level')).toBe('3');

	for (const name of ['omitted']) {
		// The signature default, not the factory's placeholder.
		expect(widget(container, name).root?.getAttribute('data-tone'), name).toBe('quiet');
		expect(widget(container, name).readout?.getAttribute('data-level'), name).toBe('0');
		expect(widget(container, name).readout?.textContent, name).toBe('quiet');
	}
}

test('CSR: an omitted prop seeds the signature default, not the factory placeholder', async () => {
	const screen = await render(Page);
	expectDefaultsSeeded(screen.container as HTMLElement);
});

test('SSR: the server HTML carries the seeded defaults, and the mount agrees', async () => {
	const phased = await renderSSRPhased(Page);

	const rootTags = phased.html.match(/<div[^>]*data-sd-root[^>]*>/g) ?? [];
	expect(rootTags.length).toBe(2);
	expect(rootTags.filter((tag) => tag.includes('data-tone="quiet"')).length).toBe(1);
	expect(rootTags.filter((tag) => tag.includes('data-tone="loud"')).length).toBe(1);
	expect(rootTags.filter((tag) => tag.includes('placeholder')).length).toBe(0);

	expectDefaultsSeeded(phased.mount().container);
});

test('SSR resume: the seeded defaults survive resume', async () => {
	const screen = await renderSSR(Page);
	expectDefaultsSeeded(screen.container);
});
