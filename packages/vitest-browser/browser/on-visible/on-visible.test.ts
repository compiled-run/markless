import { expect, test } from 'vitest';
import { render, renderSSR } from '../../src/index.ts';
import VisibleArmOpen from './visible-arm-open.tsrx';
import VisibleArm from './visible-arm.tsrx';
import VisiblePage from './visible-page.tsrx';
import VisibleRows from './visible-rows.tsrx';

// Nothing here scrolls or moves the pointer: each handler has to run because its element is on screen.
const settle = (ms = 150) => new Promise((done) => setTimeout(done, ms));
const seen = (container: HTMLElement) => container.querySelector('output[data-seen]')?.textContent;

for (const mode of ['csr', 'ssr'] as const) {
	const csr = async (component: Parameters<typeof render>[0]) =>
		(await render(component)).container as unknown as HTMLElement;
	const mount = {
		page: async () =>
			mode === 'csr' ? csr(VisiblePage) : (await renderSSR(VisiblePage)).container,
		arm: async () =>
			mode === 'csr' ? csr(VisibleArm) : (await renderSSR(VisibleArm)).container,
		open: async () =>
			mode === 'csr' ? csr(VisibleArmOpen) : (await renderSSR(VisibleArmOpen)).container,
		rows: async () =>
			mode === 'csr' ? csr(VisibleRows) : (await renderSSR(VisibleRows)).container,
	};

	test(`${mode}: onVisible on a lone element runs once it is on screen, before any input`, async () => {
		const container = await mount.page();
		await expect.poll(() => container.querySelector('[data-visible]')?.textContent).toBe('yes');
		await settle();
		expect(seen(container)).toBe('1');
	});

	test(`${mode}: onVisible inside an @if arm runs once the arm mounts, and again when it remounts`, async () => {
		const container = await mount.arm();
		await settle();
		expect(seen(container)).toBe('0');
		container.querySelector<HTMLButtonElement>('button[data-toggle]')!.click();
		await expect.poll(() => seen(container)).toBe('1');
		container.querySelector<HTMLButtonElement>('button[data-toggle]')!.click();
		await expect.poll(() => container.querySelector('p[data-visible]')).toBeNull();
		container.querySelector<HTMLButtonElement>('button[data-toggle]')!.click();
		await expect.poll(() => seen(container)).toBe('2');
	});

	test(`${mode}: onVisible inside an arm open at first render runs once, before any input`, async () => {
		const container = await mount.open();
		await expect.poll(() => seen(container)).toBe('1');
		await settle();
		expect(seen(container)).toBe('1');
	});

	test(`${mode}: onVisible on @for rows runs for the first row and for each row added later`, async () => {
		const container = await mount.rows();
		await expect.poll(() => seen(container)).toBe('1');
		container.querySelector<HTMLButtonElement>('button[data-add]')!.click();
		await expect.poll(() => container.querySelectorAll('li').length).toBe(2);
		await expect.poll(() => seen(container)).toBe('2');
		await settle();
		expect(seen(container)).toBe('2');
	});
}
