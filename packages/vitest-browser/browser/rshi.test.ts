import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import OnePage from './fixtures/rshi-one-page.tsrx';
import TwoPage from './fixtures/rshi-two-page.tsrx';

// Defect 78. A widget-scoped element() handle read from a METHOD of the shared
// record, called by a part that binds no handle of its own: the carousel
// trigger's shape. The reading part's own edge path names no rendered widget,
// so before this witness the read fell back to the module-level id, two rendered
// widgets had filed it, and the registry refused the handler outright.
afterEach(() => cleanup());

function pairs(container: ParentNode) {
	const tracks = [...container.querySelectorAll<HTMLElement>('[data-rshi-track]')];
	const triggers = [...container.querySelectorAll<HTMLButtonElement>('[data-rshi-trigger]')];
	if (tracks.length !== 2 || triggers.length !== 2)
		throw new Error(`Expected two tracks and two triggers, saw ${tracks.length}/${triggers.length}.`);
	return { tracks, triggers };
}

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: the first widget's trigger reaches its own track and only it`, async () => {
		const screen = mode === 'CSR' ? await render(TwoPage) : await renderSSR(TwoPage);
		const { tracks, triggers } = pairs(screen.container as HTMLElement);

		expect(tracks[0]!.getAttribute('data-rshi-hit')).toBeNull();
		triggers[0]!.click();
		await expect.poll(() => tracks[0]!.getAttribute('data-rshi-hit')).toBe('1');
		expect(tracks[1]!.getAttribute('data-rshi-hit')).toBeNull();
	});

	// The other direction, so no registration order can pass by accident.
	test(`${mode}: the second widget's trigger reaches its own track and only it`, async () => {
		const screen = mode === 'CSR' ? await render(TwoPage) : await renderSSR(TwoPage);
		const { tracks, triggers } = pairs(screen.container as HTMLElement);

		triggers[1]!.click();
		await expect.poll(() => tracks[1]!.getAttribute('data-rshi-hit')).toBe('1');
		expect(tracks[0]!.getAttribute('data-rshi-hit')).toBeNull();
	});

	test(`${mode}: each widget's state stays beside its own element`, async () => {
		const screen = mode === 'CSR' ? await render(TwoPage) : await renderSSR(TwoPage);
		const { tracks, triggers } = pairs(screen.container as HTMLElement);
		const roots = [...(screen.container as HTMLElement).querySelectorAll('[data-rshi-root]')];

		triggers[0]!.click();
		await expect.poll(() => tracks[0]!.getAttribute('data-rshi-hit')).toBe('1');
		await expect.poll(() => roots[0]!.getAttribute('data-steps')).toBe('1');
		expect(roots[1]!.getAttribute('data-steps')).toBe('0');
	});

	// The single-instance page must keep working through the same spelling: one
	// rendered widget is the case the module-level fallback used to carry.
	test(`${mode}: one widget on the page still reaches its track`, async () => {
		const screen = mode === 'CSR' ? await render(OnePage) : await renderSSR(OnePage);
		const track = (screen.container as HTMLElement).querySelector<HTMLElement>('[data-rshi-track]')!;
		const trigger = (screen.container as HTMLElement).querySelector<HTMLButtonElement>(
			'[data-rshi-trigger]',
		)!;

		trigger.click();
		await expect.poll(() => track.getAttribute('data-rshi-hit')).toBe('1');
		trigger.click();
		await expect.poll(() => track.getAttribute('data-rshi-hit')).toBe('2');
	});
}
