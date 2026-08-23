import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import ThreePage from './fixtures/hi-three-page.tsrx';
import TwoPage from './fixtures/hi-two-page.tsrx';

// A widget-scoped element() handle names one element PER RENDERED WIDGET. With
// two instances of the same widget on one page, every handler must reach its own
// instance's element. Before this witness a flat by-handleId map answered every
// handler with the LAST registration, so instance one's trigger poked instance
// two's panel and instance one's panel was never touched.
afterEach(() => cleanup());

function pairs(container: ParentNode) {
	const panels = [...container.querySelectorAll<HTMLElement>('[data-hi-panel]')];
	const triggers = [...container.querySelectorAll<HTMLButtonElement>('[data-hi-trigger]')];
	if (panels.length !== 2 || triggers.length !== 2)
		throw new Error(
			`Expected two panels and two triggers, saw ${panels.length}/${triggers.length}.`,
		);
	return { panels, triggers };
}

test('CSR: the first instance trigger reaches the first instance panel', async () => {
	const screen = await render(TwoPage);
	const { panels, triggers } = pairs(screen.container as HTMLElement);

	expect(panels[0]!.getAttribute('data-hi-hit')).toBeNull();
	triggers[0]!.click();
	await expect.poll(() => panels[0]!.getAttribute('data-hi-hit')).toBe('yes');
	expect(panels[1]!.getAttribute('data-hi-hit')).toBeNull();
});

// The registration-order case the select unit measured: the widget that acts is
// listed SECOND, so the flat map happened to answer it correctly while the first
// was wrong. Both directions are asserted so neither order can pass by accident.
test('CSR: the second instance trigger reaches the second instance panel', async () => {
	const screen = await render(TwoPage);
	const { panels, triggers } = pairs(screen.container as HTMLElement);

	triggers[1]!.click();
	await expect.poll(() => panels[1]!.getAttribute('data-hi-hit')).toBe('yes');
	expect(panels[0]!.getAttribute('data-hi-hit')).toBeNull();
});

test('CSR: each instance keeps its own state beside its own element', async () => {
	const screen = await render(TwoPage);
	const { panels, triggers } = pairs(screen.container as HTMLElement);
	const roots = [...(screen.container as HTMLElement).querySelectorAll('[data-hi-root]')];

	triggers[0]!.click();
	await expect.poll(() => panels[0]!.getAttribute('data-hi-hit')).toBe('yes');
	await expect.poll(() => roots[0]!.getAttribute('data-hits')).toBe('1');
	expect(roots[1]!.getAttribute('data-hits')).toBe('0');
});

test('SSR resume: the first instance trigger reaches the first instance panel', async () => {
	const screen = await renderSSR(TwoPage);
	const { panels, triggers } = pairs(screen.container as HTMLElement);

	expect(panels[0]!.getAttribute('data-hi-hit')).toBeNull();
	triggers[0]!.click();
	await expect.poll(() => panels[0]!.getAttribute('data-hi-hit')).toBe('yes');
	expect(panels[1]!.getAttribute('data-hi-hit')).toBeNull();
});

test('SSR resume: the second instance trigger reaches the second instance panel', async () => {
	const screen = await renderSSR(TwoPage);
	const { panels, triggers } = pairs(screen.container as HTMLElement);

	triggers[1]!.click();
	await expect.poll(() => panels[1]!.getAttribute('data-hi-hit')).toBe('yes');
	expect(panels[0]!.getAttribute('data-hi-hit')).toBeNull();
});

// Hardcoding resistance: three instances, the acting one in the middle, its
// trigger authored before its panel, and one instance a wrapper deeper. Neither
// registration order, document order inside an instance, nor nesting depth may
// be what answers.
function trio(container: ParentNode) {
	const panels = [...container.querySelectorAll<HTMLElement>('[data-hi-panel]')];
	const triggers = [...container.querySelectorAll<HTMLButtonElement>('[data-hi-trigger]')];
	if (panels.length !== 3 || triggers.length !== 3)
		throw new Error(
			`Expected three panels and three triggers, saw ${panels.length}/${triggers.length}.`,
		);
	return { panels, triggers };
}

test('CSR: the middle instance of three reaches its own element and only it', async () => {
	const screen = await render(ThreePage);
	const { panels, triggers } = trio(screen.container as HTMLElement);

	triggers[1]!.click();
	await expect.poll(() => panels[1]!.getAttribute('data-hi-hit')).toBe('yes');
	expect(panels[0]!.getAttribute('data-hi-hit')).toBeNull();
	expect(panels[2]!.getAttribute('data-hi-hit')).toBeNull();
});

test('SSR resume: the middle instance of three reaches its own element and only it', async () => {
	const screen = await renderSSR(ThreePage);
	const { panels, triggers } = trio(screen.container as HTMLElement);

	triggers[1]!.click();
	await expect.poll(() => panels[1]!.getAttribute('data-hi-hit')).toBe('yes');
	expect(panels[0]!.getAttribute('data-hi-hit')).toBeNull();
	expect(panels[2]!.getAttribute('data-hi-hit')).toBeNull();
});

test('SSR resume: every one of three instances reaches its own element', async () => {
	const screen = await renderSSR(ThreePage);
	const { panels, triggers } = trio(screen.container as HTMLElement);

	for (const [index, trigger] of triggers.entries()) {
		trigger.click();
		await expect.poll(() => panels[index]!.getAttribute('data-hi-hit')).toBe('yes');
	}
	expect(panels.map((panel) => panel.getAttribute('data-hi-hit'))).toEqual([
		'yes',
		'yes',
		'yes',
	]);
});

test('SSR resume: each instance keeps its own state beside its own element', async () => {
	const screen = await renderSSR(TwoPage);
	const { panels, triggers } = pairs(screen.container as HTMLElement);
	const roots = [...(screen.container as HTMLElement).querySelectorAll('[data-hi-root]')];

	triggers[1]!.click();
	await expect.poll(() => panels[1]!.getAttribute('data-hi-hit')).toBe('yes');
	await expect.poll(() => roots[1]!.getAttribute('data-hits')).toBe('1');
	expect(roots[0]!.getAttribute('data-hits')).toBe('0');
});
