import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { parkPointerBeforeMount, watchForThrows } from '../demand-load-replay/counting.ts';
import SvgGrabPage from './svg-grab-page.tsrx';
import SvgPressPage from './svg-press-page.tsrx';

afterEach(async () => {
	await cleanup();
});

const text = (testid: string) => page.getByTestId(testid).element().textContent;

async function mount(mode: 'CSR' | 'SSR'): Promise<void> {
	if (mode === 'CSR') await render(SvgPressPage);
	else await renderSSR(SvgPressPage);
}

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: pointerdown on an SVG <g> in an @for runs beside its enter and leave handlers`, async () => {
		const thrown = watchForThrows();
		try {
			await parkPointerBeforeMount();
			await mount(mode);
			await userEvent.hover(page.getByTestId('piece-wp'));
			await expect.poll(() => text('hover')).toBe('wp');
			await userEvent.click(page.getByTestId('piece-wp'));
			await expect.poll(() => text('downs')).toBe('1');
			expect(text('last')).toBe('wp');
			await userEvent.click(page.getByTestId('piece-wn'));
			await expect.poll(() => text('downs')).toBe('2');
			expect(text('last')).toBe('wn');
			await userEvent.click(page.getByTestId('lone'));
			await expect.poll(() => text('lone-downs')).toBe('1');
			expect(thrown.seen).toEqual([]);
		} finally {
			thrown.stop();
		}
	});

	test(`${mode}: a cold first press on an SVG piece, with no hover before it, runs its pointerdown`, async () => {
		const thrown = watchForThrows();
		try {
			await parkPointerBeforeMount();
			await mount(mode);
			await userEvent.click(page.getByTestId('piece-bk'));
			await expect.poll(() => text('downs')).toBe('1');
			expect(text('last')).toBe('bk');
			expect(thrown.seen).toEqual([]);
		} finally {
			thrown.stop();
		}
	});

	// A touch sends its crossing and its press in one task, with nothing before it.
	test(`${mode}: a touch-shaped first press (over, enter, down in one task) runs its pointerdown`, async () => {
		const thrown = watchForThrows();
		try {
			await parkPointerBeforeMount();
			await mount(mode);
			const piece = page.getByTestId('piece-wn').element().firstElementChild!;
			const init = {
				bubbles: true,
				composed: true,
				pointerType: 'touch',
				isPrimary: true,
				button: 0,
				buttons: 1,
			};
			piece.dispatchEvent(new PointerEvent('pointerover', init));
			piece.dispatchEvent(new PointerEvent('pointerenter', { ...init, bubbles: false }));
			piece.parentElement!.dispatchEvent(
				new PointerEvent('pointerenter', { ...init, bubbles: false }),
			);
			piece.dispatchEvent(new PointerEvent('pointerdown', init));
			await expect.poll(() => text('downs')).toBe('1');
			expect(text('last')).toBe('wn');
			expect(thrown.seen).toEqual([]);
		} finally {
			thrown.stop();
		}
	});
}

async function mountGrab(mode: 'CSR' | 'SSR'): Promise<void> {
	if (mode === 'CSR') await render(SvgGrabPage);
	else await renderSSR(SvgGrabPage);
}

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: a press on a piece inside a button runs a handler that calls a body helper`, async () => {
		const thrown = watchForThrows();
		try {
			await parkPointerBeforeMount();
			await mountGrab(mode);
			await userEvent.hover(page.getByTestId('piece-bk'));
			await expect.poll(() => text('hover')).toBe('bk');
			await userEvent.click(page.getByTestId('piece-bk'));
			await expect.poll(() => text('grabs')).toBe('1');
			expect(Number(text('from-x'))).toBeGreaterThan(0);
			expect(thrown.seen).toEqual([]);
		} finally {
			thrown.stop();
		}
	});
}
