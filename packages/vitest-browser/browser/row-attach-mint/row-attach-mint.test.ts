import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { attachLog } from './attach-log.ts';
import RowAttachInputPage from './row-attach-input-page.tsrx';
import RowAttachPage from './row-attach-page.tsrx';

// Rows built in the browser run their attach, and a removed row runs its cleanup.
beforeEach(() => void attachLog.splice(0));
afterEach(() => cleanup());

const shown = (container: ParentNode, id: string) =>
	[...container.querySelectorAll(`#${id} .row`)].map((row) => row.innerHTML).join(' | ');

function press(container: ParentNode, op: string) {
	container.querySelector<HTMLButtonElement>(`[data-op="${op}"]`)!.click();
}

for (const mode of ['SSR', 'CSR'] as const) {
	test(`${mode}: rows inserted on the client run an attach that reads the row`, async () => {
		const { container } = await (mode === 'SSR' ? renderSSR(RowAttachPage) : render(RowAttachPage));
		container.querySelector<HTMLButtonElement>('.fill')!.click();
		await expect
			.poll(() => [...container.querySelectorAll('.rows .row')].map((row) => row.innerHTML).join(' | '))
			.toBe('<b>bold</b> | <i>italic</i>');
	});

	test(`${mode}: rows built in the browser run their attach, clean up on removal and attach again when re-added`, async () => {
		const { container } = await (mode === 'SSR' ? renderSSR(RowAttachInputPage) : render(RowAttachInputPage));
		if (mode === 'SSR') {
			expect(shown(container, 'early')).toBe('');
			container.querySelector<HTMLElement>('#early .row')!.click();
		}
		await expect.poll(() => shown(container, 'early')).toBe('one');
		attachLog.splice(0);
		press(container, 'fill');
		await expect.poll(() => shown(container, 'late')).toBe('one | two');
		await expect.poll(() => shown(container, 'early')).toBe('one | two');
		press(container, 'drop');
		await expect.poll(() => shown(container, 'late')).toBe('two');
		expect(shown(container, 'early')).toBe('two');
		await expect.poll(() => attachLog.filter((entry) => entry === '-one').length).toBe(2);
		press(container, 'back');
		await expect.poll(() => shown(container, 'late')).toBe('one | two');
		await expect.poll(() => shown(container, 'early')).toBe('one | two');
		expect(attachLog.filter((entry) => entry === '+one').length).toBe(3);
		expect(attachLog.filter((entry) => entry === '+two').length).toBe(2);
	});
}
