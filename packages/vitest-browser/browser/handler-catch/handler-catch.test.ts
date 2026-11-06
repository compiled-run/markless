import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { CallbackProp } from './callback-prop.tsrx';
import { failing, fetches } from './ledger.ts';
import { ResetChild } from './reset-child.tsrx';
import { SharedValue } from './shared-value.tsrx';

afterEach(() => cleanup());
beforeEach(() => {
	fetches.report = 0;
	fetches.balance = 0;
	failing.add('balance');
});

const text = (container: ParentNode, selector: string) =>
	container.querySelector(selector)?.textContent ?? null;

const follows = (first: Element, second: Element) =>
	!!(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

function click(container: HTMLElement, selector: string) {
	const target = container.querySelector<HTMLElement>(selector);
	if (!target) throw new Error(`Expected ${selector} in the rendered DOM.`);
	target.click();
}

function uncaught() {
	const reasons: unknown[] = [];
	const onRejection = (event: PromiseRejectionEvent) => {
		reasons.push(event.reason);
		event.preventDefault();
	};
	window.addEventListener('unhandledrejection', onRejection);
	return { reasons, stop: () => window.removeEventListener('unhandledrejection', onRejection) };
}

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: a handler's rejection fails only the @try around its element, keeps its content, and reset clears it without a refetch`, async () => {
		const errors = uncaught();
		try {
			const { container } = await (mode === 'CSR' ? render(SharedValue) : renderSSR(SharedValue));
			await expect.poll(() => text(container, '[data-days]'), { timeout: 5_000 }).toBe('7');
			await expect.poll(() => text(container, '[data-other-days]')).toBe('7');
			const fetchedBefore = fetches.report;

			click(container, '[data-save]');
			await expect.poll(() => text(container, '[data-failed]')).toBe('could not save 7');
			const first = container.querySelector('[data-first]')!;
			expect(text(first, '[data-days]')).toBe('7');
			expect(text(first, '[data-note]')).toBe('saving');
			expect(follows(first.querySelector('[data-days]')!, first.querySelector('[data-failed]')!)).toBe(true);
			expect(text(container, '[data-other-days]')).toBe('7');
			expect(container.querySelector('[data-other-failed]')).toBeNull();

			click(container, '[data-retry]');
			await expect.poll(() => container.querySelector('[data-failed]')).toBeNull();
			expect(text(container, '[data-days]')).toBe('7');
			expect(fetches.report).toBe(fetchedBefore);
			expect(errors.reasons).toEqual([]);
		} finally {
			errors.stop();
		}
	});

	test(`${mode}: a rejecting callback prop reaches the nearest @catch around the child, past a @try with no @catch`, async () => {
		const errors = uncaught();
		try {
			const { container } = await (mode === 'CSR' ? render(CallbackProp) : renderSSR(CallbackProp));
			await expect.poll(() => text(container, '[data-days]'), { timeout: 5_000 }).toBe('30');

			click(container, '[data-save]');
			await expect.poll(() => text(container, '[data-failed]')).toBe('could not save 30');
			expect(text(container, '[data-range]')).toBe('May-June');
			expect(text(container, '[data-days]')).toBe('30');
			expect(text(container, '[data-note]')).toBe('saving');
			expect(errors.reasons).toEqual([]);

			click(container, '[data-retry]');
			await expect.poll(() => container.querySelector('[data-failed]')).toBeNull();
			expect(text(container, '[data-days]')).toBe('30');
		} finally {
			errors.stop();
		}
	});

	test(`${mode}: reset handed down two components re-runs the failed value from the grandchild's handler`, async () => {
		const { container } = await (mode === 'CSR' ? render(ResetChild) : renderSSR(ResetChild));
		await expect.poll(() => text(container, '[data-failed]'), { timeout: 5_000 }).toBe('Account closed');
		const fetchedBefore = fetches.balance;

		failing.delete('balance');
		click(container, '[data-retry]');
		await expect.poll(() => text(container, '[data-amount]')).toBe('10');
		expect(container.querySelector('[data-failed]')).toBeNull();
		expect(fetches.balance).toBe(fetchedBefore + 1);
	});
}
