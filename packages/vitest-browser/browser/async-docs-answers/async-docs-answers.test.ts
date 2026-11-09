import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import HandlerReject from './handler-reject.tsrx';
import HandlerRejectNoCatch from './handler-reject-no-catch.tsrx';
import TryOnly from './try-only.tsrx';

afterEach(() => cleanup());

const text = (container: ParentNode, selector: string) =>
	container.querySelector(selector)?.textContent ?? null;

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: a @try with no @catch shows nothing in its spot when the first load fails`, async () => {
		const { container } = await (mode === 'CSR' ? render(TryOnly) : renderSSR(TryOnly));
		await expect.poll(() => container.querySelector('[data-pending]')).toBeNull();
		expect(text(container, '[data-heading]')).toBe('Report');
		expect(container.querySelector('[data-boundary]')?.textContent?.trim()).toBe('');

		container.querySelector<HTMLElement>('[data-retry]')!.click();
		await expect.poll(() => text(container, '[data-total]')).toBe('42');
	});

	test(`${mode}: a rejected promise from a handler with no enclosing @catch still reaches the browser as an uncaught error`, async () => {
		const reasons: unknown[] = [];
		const onRejection = (event: PromiseRejectionEvent) => {
			reasons.push(event.reason);
			event.preventDefault();
		};
		const onError = (event: ErrorEvent) => {
			reasons.push(event.error);
			event.preventDefault();
		};
		window.addEventListener('unhandledrejection', onRejection);
		window.addEventListener('error', onError);
		try {
			const { container } = await (mode === 'CSR'
				? render(HandlerRejectNoCatch)
				: renderSSR(HandlerRejectNoCatch));
			await expect.poll(() => text(container, '[data-days]')).toBe('7');

			container.querySelector<HTMLElement>('[data-save]')!.click();
			await expect.poll(() => reasons.length).toBeGreaterThan(0);
			for (const reason of reasons) expect((reason as Error).message).toBe('could not save 7');
			await expect.poll(() => text(container, '[data-note]')).toBe('saving');
			expect(text(container, '[data-days]')).toBe('7');
		} finally {
			window.removeEventListener('unhandledrejection', onRejection);
			window.removeEventListener('error', onError);
		}
	});

	test(`${mode}: a rejected promise from a handler reaches its nearest enclosing @catch, keeping the content before it, and reset clears it`, async () => {
		const reasons: unknown[] = [];
		const onRejection = (event: PromiseRejectionEvent) => {
			reasons.push(event.reason);
			event.preventDefault();
		};
		window.addEventListener('unhandledrejection', onRejection);
		try {
			const { container } = await (mode === 'CSR' ? render(HandlerReject) : renderSSR(HandlerReject));
			await expect.poll(() => text(container, '[data-days]')).toBe('7');

			container.querySelector<HTMLElement>('[data-save]')!.click();
			// The write the handler made before awaiting `saveReport` stays.
			await expect.poll(() => text(container, '[data-note]')).toBe('saving');
			await expect.poll(() => text(container, '[data-failed]')).toBe('could not save 7');
			// The @try content is kept, not cleared, with @catch drawn after it.
			expect(text(container, '[data-days]')).toBe('7');
			expect(text(container, '[data-note]')).toBe('saving');
			expect(reasons).toHaveLength(0);

			container.querySelector<HTMLElement>('[data-retry]')!.click();
			await expect.poll(() => container.querySelector('[data-failed]')).toBeNull();
			expect(text(container, '[data-days]')).toBe('7');
		} finally {
			window.removeEventListener('unhandledrejection', onRejection);
		}
	});
}
