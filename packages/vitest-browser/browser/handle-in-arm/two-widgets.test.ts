import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import TwoWidgetsPage from './two-widgets-page.tsrx';

// Two rendered widgets on one page, each binding the same authored handle
// inside its own flippable arm. The arm files its handle at resume, so the
// registration has to name the instance the branch belongs to or both widgets
// land under one key: the reader then answers for the wrong widget, or refuses.
afterEach(() => cleanup());

function widgets(container: ParentNode) {
	return [...container.querySelectorAll<HTMLElement>('[data-widget]')].map((widget) => ({
		widget,
		toggle: widget.querySelector<HTMLButtonElement>('[data-toggle]')!,
		probe: widget.querySelector<HTMLButtonElement>('[data-probe]')!,
		panel: () => widget.querySelector<HTMLElement>('[data-panel]'),
	}));
}

async function expectEachWidgetProbesItsOwnPanel(container: ParentNode) {
	const [first, second] = widgets(container);
	expect(first, 'the page renders two widgets').toBeDefined();
	expect(second, 'the page renders two widgets').toBeDefined();
	// Served closed and served open, so the two arms reach resume by both routes.
	expect(first!.panel()).toBe(null);
	expect(second!.panel()).not.toBe(null);

	first!.toggle.click();
	await expect.poll(() => first!.panel()).not.toBe(null);

	first!.probe.click();
	await expect.poll(() => first!.widget.getAttribute('data-mark')).toBe('bound');
	expect(first!.panel()!.getAttribute('data-probed')).toBe(
		first!.widget.getAttribute('data-probes'),
	);
	// The other widget's arm rendered a panel too, and this probe never touched it.
	expect(second!.panel()!.getAttribute('data-probed')).toBe(null);

	second!.probe.click();
	await expect.poll(() => second!.widget.getAttribute('data-mark')).toBe('bound');
	expect(second!.panel()!.getAttribute('data-probed')).toBe(
		second!.widget.getAttribute('data-probes'),
	);
	expect(first!.panel()!.getAttribute('data-probed')).toBe(
		first!.widget.getAttribute('data-probes'),
	);

	// One widget's flip takes only its own binding away.
	first!.toggle.click();
	await expect.poll(() => first!.panel()).toBe(null);
	first!.probe.click();
	await expect.poll(() => first!.widget.getAttribute('data-mark')).toBe('unbound');
	second!.probe.click();
	await expect.poll(() => second!.widget.getAttribute('data-probes')).toBe('2');
	expect(second!.widget.getAttribute('data-mark')).toBe('bound');
	expect(second!.panel()!.getAttribute('data-probed')).toBe('2');
}

test('CSR: each widget probes the panel its own arm bound', async () => {
	const screen = await render(TwoWidgetsPage);
	await expectEachWidgetProbesItsOwnPanel(screen.container as HTMLElement);
});

test('SSR resume: each widget probes the panel its own arm bound', async () => {
	const screen = await renderSSR(TwoWidgetsPage);
	await expectEachWidgetProbesItsOwnPanel(screen.container as HTMLElement);
});
