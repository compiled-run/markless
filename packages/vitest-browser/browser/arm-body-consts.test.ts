import { cleanup, render, renderSSR } from '../src/index.ts';
import { afterEach, expect, test } from 'vitest';
import Page from './fixtures/arm-body-consts.tsrx';
import ImportedPage from './fixtures/arm-body-consts-imported/page.tsrx';

// An @if arm that shows component-body consts, one derived from a prop, rebuilds them on every flip.

afterEach(cleanup);

async function exercise(container: ParentNode) {
	const disclosure = (path: string) => {
		const root = container.querySelector(`[data-disclosure="${path}"]`)!;
		return {
			toggle: () => (root.querySelector('[data-toggle]') as HTMLButtonElement).click(),
			panel: () => root.querySelector('[data-panel]'),
		};
	};
	const a = disclosure('/a');
	const b = disclosure('/b');
	expect(a.panel()).toBeNull();

	a.toggle();
	await expect.poll(() => a.panel()?.id).toBe('alpha');
	expect(a.panel()?.textContent).toBe('Alpha page');
	expect(a.panel()?.getAttribute('title')).toBe('Alpha page details');
	expect(b.panel()).toBeNull();

	b.toggle();
	await expect.poll(() => b.panel()?.id).toBe('beta');
	expect(b.panel()?.getAttribute('title')).toBe('Beta page details');

	a.toggle();
	await expect.poll(a.panel).toBeNull();
	a.toggle();
	await expect.poll(() => a.panel()?.textContent).toBe('Alpha page');
}

async function exerciseImported(container: ParentNode) {
	const panel = (path: string) => container.querySelector(`[data-disclosure="${path}"] [data-panel]`);
	const toggle = (path: string) =>
		(container.querySelector(`[data-disclosure="${path}"] [data-toggle]`) as HTMLButtonElement).click();
	toggle('/d');
	await expect.poll(() => panel('/d')?.id).toBe('delta');
	expect(panel('/d')?.getAttribute('title')).toBe('Delta page details');
	expect(panel('/c')).toBeNull();
	toggle('/c');
	await expect.poll(() => panel('/c')?.textContent).toBe('Gamma page');
}

test('CSR: an imported component arm rebuilds the body consts its props decide', async () => {
	const screen = await render(ImportedPage);
	await exerciseImported(screen.container as HTMLElement);
});

test('SSR: an imported component arm rebuilds the body consts its props decide', async () => {
	const screen = await renderSSR(ImportedPage);
	await exerciseImported(screen.container as HTMLElement);
});

test('CSR: an arm showing body consts rebuilds them when it flips', async () => {
	const screen = await render(Page);
	await exercise(screen.container as HTMLElement);
});

test('SSR: an arm showing body consts rebuilds them when it flips after resume', async () => {
	const screen = await renderSSR(Page);
	await exercise(screen.container as HTMLElement);
});
