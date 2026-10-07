import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import { render, renderSSR } from '../../src/index.ts';
import CallbackPage from './loop-callback-page.tsrx';
import TabsHandlerPage from './tabs-loop-handler-page.tsrx';
import TabsPage from './tabs-loop-page.tsrx';
import TabsAncestorPage from './tabs-loop-ancestor-page.tsrx';
import RadioPage from './radio-loop-page.tsrx';
import CodeBlockPage from './code-block-page.tsrx';

const el = (testid: string) => page.getByTestId(testid).element() as HTMLElement;
const selected = (testid: string) => el(testid).hasAttribute('ui-selected');

for (const mode of ['CSR', 'SSR'] as const) {
	for (const shape of [
		'tabs in a loop',
		'tabs in a loop beside a handler of its own',
		'tabs in a loop under ancestor handlers',
	] as const) {
		test(`${mode}: ${shape} keep each trigger's value`, async () => {
			if (shape === 'tabs in a loop') {
				if (mode === 'CSR') await render(TabsPage);
				else await renderSSR(TabsPage);
			} else if (shape === 'tabs in a loop beside a handler of its own') {
				if (mode === 'CSR') await render(TabsHandlerPage);
				else await renderSSR(TabsHandlerPage);
			} else if (mode === 'CSR') await render(TabsAncestorPage);
			else await renderSSR(TabsAncestorPage);
			expect(selected('trigger-one.tsrx')).toBe(true);
			expect(el('panel-two.ts').hidden).toBe(true);

			await userEvent.click(el('trigger-two.ts'));
			await expect.poll(() => selected('trigger-two.ts')).toBe(true);
			await expect.poll(() => el('panel-two.ts').hidden).toBe(false);
			expect(selected('trigger-one.tsrx')).toBe(false);
			expect(el('panel-one.tsrx').hidden).toBe(true);

			await userEvent.click(el('trigger-three.css'));
			await expect.poll(() => selected('trigger-three.css')).toBe(true);
			await expect.poll(() => el('panel-three.css').hidden).toBe(false);
			expect(el('panel-two.ts').hidden).toBe(true);
		});
	}

	test(`${mode}: a looped click handler keeps reaching the parent's callback`, async () => {
		if (mode === 'CSR') await render(CallbackPage);
		else await renderSSR(CallbackPage);
		el('pick-green').click();
		await expect.poll(() => el('picked').textContent).toBe('green');
		el('pick-blue').click();
		await expect.poll(() => el('picked').textContent).toBe('blue');
		el('pick-red').click();
		await expect.poll(() => el('picked').textContent).toBe('red');
		expect(el('count').textContent).toBe('3');
	});

	test(`${mode}: radio items in a loop keep each item's value`, async () => {
		if (mode === 'CSR') await render(RadioPage);
		else await renderSSR(RadioPage);
		expect(el('radio-small').hasAttribute('ui-selected')).toBe(true);
		el('radio-large').click();
		await expect.poll(() => el('radio-picked').textContent).toBe('large');
		await expect.poll(() => el('radio-large').hasAttribute('ui-selected')).toBe(true);
		expect(el('radio-small').hasAttribute('ui-selected')).toBe(false);
		el('radio-medium').click();
		await expect.poll(() => el('radio-picked').textContent).toBe('medium');
		await expect.poll(() => el('radio-medium').hasAttribute('ui-selected')).toBe(true);
	});

	// The trigger's handlers and the enclosing component's own share local ids
	// (`symbol:0`...); the composer must not route one onto the other.
	test(`${mode}: looped tab triggers in a component whose own handlers capture its props`, async () => {
		if (mode === 'CSR') await render(CodeBlockPage);
		else await renderSSR(CodeBlockPage);
		const tab = (name: string) => page.getByRole('tab', { name }).element() as HTMLElement;
		expect(tab('a.tsrx').hasAttribute('ui-selected')).toBe(true);
		await userEvent.click(tab('b.ts'));
		await expect.poll(() => tab('b.ts').hasAttribute('ui-selected')).toBe(true);
		expect(tab('a.tsrx').hasAttribute('ui-selected')).toBe(false);
		await userEvent.click(tab('c.css'));
		await expect.poll(() => tab('c.css').hasAttribute('ui-selected')).toBe(true);
	});
}
