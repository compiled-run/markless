import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { CallbackProp } from './callback-prop.tsrx';
import { ChildOwn } from './child-own.tsrx';
import { NoAsyncRead } from './no-async-read.tsrx';
import { Nested } from './nested.tsrx';
import { UnknownHandlers } from './unknown-handlers.tsrx';
import { ReturnedPromise } from './returned-promise.tsrx';
import { failing, fetches } from './ledger.ts';
import { ResetChild } from './reset-child.tsrx';
import { RowChildren } from './row-children.tsrx';
import { RowWrapped } from './row-wrapped.tsrx';
import { RowComponents } from './row-components.tsrx';
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
			expect(text(container, '[data-note]')).toBe('saving');
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
			expect(text(container, '[data-note]')).toBe('saving');
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

	test(`${mode}: a grandchild's own async handler rejects into the @catch around its ancestor's use, and the state it wrote survives reset`, async () => {
		const errors = uncaught();
		try {
			const { container } = await (mode === 'CSR' ? render(ChildOwn) : renderSSR(ChildOwn));
			await expect.poll(() => text(container, '[data-days]'), { timeout: 5_000 }).toBe('7');

			click(container, '[data-save]');
			await expect.poll(() => text(container, '[data-failed]')).toBe('could not save 7');
			expect(text(container, '[data-note]')).toBe('saving');
			expect(errors.reasons).toEqual([]);

			click(container, '[data-retry]');
			await expect.poll(() => container.querySelector('[data-failed]')).toBeNull();
			expect(text(container, '[data-days]')).toBe('7');
			expect(text(container, '[data-note]')).toBe('saving');
		} finally {
			errors.stop();
		}
	});

	test(`${mode}: a @try that reads no async value still shows its handler's rejection in @catch`, async () => {
		const errors = uncaught();
		try {
			const { container } = await (mode === 'CSR' ? render(NoAsyncRead) : renderSSR(NoAsyncRead));
			await expect.poll(() => text(container, '[data-note]'), { timeout: 5_000 }).toBe('idle');

			click(container, '[data-save]');
			await expect.poll(() => text(container, '[data-failed]')).toBe('could not save 3');
			expect(text(container, '[data-note]')).toBe('saving');
			expect(errors.reasons).toEqual([]);

			click(container, '[data-retry]');
			await expect.poll(() => container.querySelector('[data-failed]')).toBeNull();
			expect(text(container, '[data-note]')).toBe('saving');
		} finally {
			errors.stop();
		}
	});

	for (const [selector, note] of [
		['[data-then]', 'idle'],
		['[data-return]', 'returning'],
		['[data-child-save]', 'child'],
	] as const)
		test(`${mode}: a plain handler that returns a promise (${selector}) rejects into @catch`, async () => {
			const errors = uncaught();
			try {
				const { container } = await (mode === 'CSR'
					? render(ReturnedPromise)
					: renderSSR(ReturnedPromise));
				await expect.poll(() => text(container, '[data-days]'), { timeout: 5_000 }).toBe('14');

				click(container, selector);
				await expect.poll(() => text(container, '[data-failed]')).toBe('could not save 14');
				expect(text(container, '[data-note]')).toBe(note);
				expect(errors.reasons).toEqual([]);

				click(container, '[data-retry]');
				await expect.poll(() => container.querySelector('[data-failed]')).toBeNull();
				expect(text(container, '[data-note]')).toBe(note);
			} finally {
				errors.stop();
			}
		});

	test(`${mode}: a promise a handler starts but does not return stays uncaught`, async () => {
		const errors = uncaught();
		try {
			const { container } = await (mode === 'CSR'
				? render(ReturnedPromise)
				: renderSSR(ReturnedPromise));
			await expect.poll(() => text(container, '[data-days]'), { timeout: 5_000 }).toBe('14');

			click(container, '[data-floating]');
			await expect.poll(() => errors.reasons.length).toBe(1);
			expect((errors.reasons[0] as Error).message).toBe('could not save 14');
			expect(text(container, '[data-note]')).toBe('floating');
			expect(container.querySelector('[data-failed]')).toBeNull();
		} finally {
			errors.stop();
		}
	});
}

for (const mode of ['CSR', 'SSR'] as const)
	for (const [selector, noteSelector, note] of [
		['[data-inline-save]', '[data-inner-note]', 'inline'],
		['[data-local-save]', '[data-local-note]', 'recording'],
		['[data-save]', '[data-note]', 'saving'],
	] as const)
		test(`${mode}: a rejection from ${selector} inside a nested @try shows in the inner @catch, not the outer one`, async () => {
			const errors = uncaught();
			try {
				const { container } = await (mode === 'CSR' ? render(Nested) : renderSSR(Nested));
				await expect.poll(() => text(container, '[data-days]'), { timeout: 5_000 }).toBe('9');

				click(container, selector);
				await expect.poll(() => text(container, '[data-inner-failed]')).toBe('could not save 9');
				expect(container.querySelector('[data-outer-failed]')).toBeNull();
				expect(text(container, '[data-days]')).toBe('9');
				expect(errors.reasons).toEqual([]);

				click(container, '[data-inner-retry]');
				await expect.poll(() => container.querySelector('[data-inner-failed]')).toBeNull();
				expect(text(container, noteSelector)).toBe(note);

				click(container, '[data-outer-save]');
				await expect.poll(() => text(container, '[data-outer-failed]')).toBe('could not save 9');
				expect(errors.reasons).toEqual([]);
			} finally {
				errors.stop();
			}
		});

for (const mode of ['CSR', 'SSR'] as const)
	for (const [selector, failed, retry] of [
		['[data-member-save]', '[data-inner-failed]', '[data-inner-retry]'],
		['[data-relay-save="inline"]', '[data-relay-failed="inline"]', '[data-relay-retry="inline"]'],
		['[data-relay-save="returned"]', '[data-relay-failed="returned"]', '[data-relay-retry="returned"]'],
	] as const)
		test(`${mode}: a rejection from ${selector}, whose result the compiler cannot see or that a child calls inside its own @try, shows in the nearest @catch`, async () => {
			const errors = uncaught();
			try {
				const { container } = await (mode === 'CSR'
					? render(UnknownHandlers)
					: renderSSR(UnknownHandlers));
				await expect.poll(() => text(container, '[data-days]'), { timeout: 5_000 }).toBe('9');

				click(container, selector);
				await expect.poll(() => text(container, failed)).toBe('could not save 9');
				expect(container.querySelectorAll('[data-outer-failed], [data-inner-failed], [data-relay-failed]')).toHaveLength(1);
				expect(errors.reasons).toEqual([]);

				click(container, retry);
				await expect.poll(() => container.querySelector(failed)).toBeNull();
				expect(container.querySelector(selector)).not.toBeNull();
			} finally {
				errors.stop();
			}
		});

for (const mode of ['CSR', 'SSR'] as const)
	for (const name of ['a child', 'a stateless child holding a stateful one', 'a row component'] as const)
	test(`${mode}: ${name} in a keyed row keeps its state across a failed save and reset`, async () => {
		const errors = uncaught();
		try {
			const { container } = await (mode === 'CSR'
				? render(name === 'a child' ? RowChildren : name === 'a row component' ? RowComponents : RowWrapped)
				: name === 'a child'
					? renderSSR(RowChildren)
					: name === 'a row component'
						? renderSSR(RowComponents)
						: renderSSR(RowWrapped));
			await expect.poll(() => container.querySelectorAll('[data-row]').length, { timeout: 5_000 }).toBe(2);
			const row = (id: string) => container.querySelector(`[data-row="${id}"]`)!;

			click(row('month') as HTMLElement, '[data-save]');
			await expect.poll(() => text(container, '[data-failed]')).toBe('could not save 30');
			expect(text(row('month'), '[data-note]')).toBe('saving');
			expect(text(row('week'), '[data-note]')).toBe('idle');
			expect(errors.reasons).toEqual([]);

			click(container, '[data-retry]');
			await expect.poll(() => container.querySelector('[data-failed]')).toBeNull();
			expect(container.querySelectorAll('[data-row]')).toHaveLength(2);
			expect(text(row('month'), '[data-note]')).toBe('saving');
			expect(text(row('week'), '[data-note]')).toBe('idle');

			click(row('week') as HTMLElement, '[data-save]');
			await expect.poll(() => text(container, '[data-failed]')).toBe('could not save 7');
			expect(text(row('week'), '[data-note]')).toBe('saving');
			expect(text(row('month'), '[data-note]')).toBe('saving');

			click(container, '[data-retry]');
			await expect.poll(() => container.querySelector('[data-failed]')).toBeNull();
			click(container, '[data-add]');
			await expect.poll(() => container.querySelectorAll('[data-row]').length).toBe(3);
			expect(text(row('week'), '[data-note]')).toBe('saving');
			click(row('year') as HTMLElement, '[data-save]');
			await expect.poll(() => text(container, '[data-failed]')).toBe('could not save 365');
			click(container, '[data-retry]');
			await expect.poll(() => container.querySelector('[data-failed]')).toBeNull();
			expect(text(row('year'), '[data-note]')).toBe('saving');
			expect(text(row('week'), '[data-note]')).toBe('saving');
			expect(text(row('month'), '[data-note]')).toBe('saving');
			expect(errors.reasons).toEqual([]);
		} finally {
			errors.stop();
		}
	});
