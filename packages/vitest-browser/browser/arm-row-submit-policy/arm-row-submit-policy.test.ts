import { cleanup, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import ArmRowsPage from './arm-rows-page.tsrx';
import FramedRowsPage from './framed-rows-page.tsrx';
import ShellRowsPage from './shell-rows-page.tsrx';

// A submit handler that calls preventDefault must cancel the native submit on every row, before any code loads.
afterEach(() => cleanup());

function submitRow(container: ParentNode, id: string): boolean {
	const form = container.querySelector<HTMLFormElement>(`form[data-row="${id}"]`);
	if (!form) throw new Error(`Expected form ${id} on the page.`);
	const event = new SubmitEvent('submit', { bubbles: true, cancelable: true });
	form.dispatchEvent(event);
	return event.defaultPrevented;
}

async function everyRowCancels(container: ParentNode) {
	await expect
		.poll(() => container.querySelectorAll('form[data-row]').length)
		.toBeGreaterThanOrEqual(3);
	for (const id of ['a', 'b', 'c']) {
		expect(submitRow(container, id), `row ${id}`).toBe(true);
		await expect.poll(() => container.querySelector('[data-submitted]')?.textContent).toBe(id);
	}
}

test('SSR rows inside an async boundary: every row cancels its native submit', async () => {
	await everyRowCancels((await renderSSR(ArmRowsPage)).container);
});

test('SSR rows outside any boundary: every row cancels its native submit', async () => {
	await everyRowCancels((await renderSSR(ShellRowsPage)).container);
});

test('SSR control: a plain form cancels its native submit', async () => {
	const { container } = await renderSSR(ShellRowsPage);
	expect(submitRow(container, 'plain')).toBe(true);
});

test('SSR rows between static siblings: rows cancel, the siblings submit natively', async () => {
	const { container } = await renderSSR(FramedRowsPage);
	await everyRowCancels(container);
	for (const side of ['before', 'after']) {
		const form = container.querySelector<HTMLFormElement>(`form[data-static="${side}"]`)!;
		const event = new SubmitEvent('submit', { bubbles: true, cancelable: true });
		form.dispatchEvent(event);
		expect(event.defaultPrevented, side).toBe(false);
	}
});
