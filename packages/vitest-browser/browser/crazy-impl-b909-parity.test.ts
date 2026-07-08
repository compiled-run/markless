import { afterEach, expect, test } from 'vitest';
import { resumeFromPayloadDocument } from '@markless/web/resume';
import { cleanup, renderSSR } from '../src/index.ts';
import B909Fixture from './fixtures/crazy-impl-b909-date-call.tsrx';
afterEach(() => cleanup());
function required<T extends Element>(root: ParentNode, selector: string): T {
	const element = root.querySelector<T>(selector);
	if (!element) throw new Error(`Expected ${selector}.`);
	return element;
}

function rejectionLog() {
	const values: unknown[] & { stop?: () => void } = [];
	const listener = (event: PromiseRejectionEvent) => {
		values.push(event.reason);
		event.preventDefault();
	};
	window.addEventListener('unhandledrejection', listener);
	values.stop = () => window.removeEventListener('unhandledrejection', listener);
	return values as unknown[] & { stop: () => void };
}

test('B909: tampered event-only payload reports MARKLESS_PAYLOAD_INVALID, not NaN UI (3/3)', async () => {
	for (let run = 0; run < 3; run++) {
		const { container } = await renderSSR(B909Fixture);
		const state = required<HTMLScriptElement>(container, 'script[type="markless/state"]');
		const button = required<HTMLButtonElement>(container, 'button[data-b909-count]');
		const rejections = rejectionLog();
		state.textContent = JSON.stringify({ version: 1, cells: 'tampered' });
		button.click();
		await expect
			.poll(() => rejections[0])
			.toMatchObject({
				code: 'MARKLESS_PAYLOAD_INVALID',
				docsUrl: 'https://markless.dev/errors/MARKLESS_PAYLOAD_INVALID',
			});
		expect(button.textContent).toBe('0');
		rejections.stop();
		await cleanup();
	}
});
test('B909: Date-state first-interaction method mutation works (3/3)', async () => {
	for (let run = 0; run < 3; run++) {
		const { container } = await renderSSR(B909Fixture);
		const result = required<HTMLOutputElement>(container, 'output[data-b909-date-result]');
		required<HTMLButtonElement>(container, 'button[data-b909-date]').click();
		await expect.poll(() => Number(result.textContent)).toBeGreaterThan(0);
		await cleanup();
	}
});

test('B909: second full resume is a guarded no-op warning (3/3)', async () => {
	for (let run = 0; run < 3; run++) {
		const { container } = await renderSSR(B909Fixture);
		const root = required<HTMLElement>(container, '[data-async-container]');
		await resumeFromPayloadDocument({
			document: root,
			root,
			loadSymbol: () => () => undefined,
		});
		const second = await resumeFromPayloadDocument({
			document: root,
			root,
			loadSymbol: () => {
				throw new Error('second resume must not resolve symbols');
			},
		});
		expect(second.warnings?.[0]).toMatchObject({
			code: 'MARKLESS_RESUME_ALREADY_RESUMED',
			severity: 'warning',
			phase: 'resume',
		});
		await cleanup();
	}
});
