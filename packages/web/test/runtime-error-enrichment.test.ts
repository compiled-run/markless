import { expect, test } from 'vitest';
import {
	enrichRuntimeErrorForReporting,
	markRuntimeErrorReported,
	reportRuntimeErrorToHost,
} from '../src/runtime-error-reporting.ts';
import type { RuntimeErrorReportContext } from '../src/runtime-error-reporting.ts';

const context = {
	phase: 'event',
	eventName: 'click',
	symbolId: 'symbol:click',
} as RuntimeErrorReportContext;

// `DOMException.code` is a getter with no setter, so writing it throws and the
// reporter would destroy the error it was called to describe.
test('a DOMException survives enrichment with its own name and message', () => {
	const error = new DOMException('The operation was aborted.', 'AbortError');

	const enriched = enrichRuntimeErrorForReporting(error, context);

	expect(enriched).toBe(error);
	expect(enriched.name).toBe('AbortError');
	expect(enriched.message).toBe('The operation was aborted.');
	expect(enriched.code).toBe(error.code);
	expect(enriched['marklessCode']).toBe('MARKLESS_RUNTIME_ERROR');
	expect(enriched.severity).toBe('error');
	expect(enriched.phase).toBe('runtime');
	expect(enriched.docsUrl).toBe('https://markless.dev/errors/MARKLESS_RUNTIME_ERROR');
	expect(enriched.eventName).toBe('click');
	expect(enriched.symbolId).toBe('symbol:click');
});

test('an ordinary error still carries the markless code on code itself', () => {
	const error = new Error('boom');

	const enriched = enrichRuntimeErrorForReporting(error, context);

	expect(enriched.code).toBe('MARKLESS_RUNTIME_ERROR');
	expect(enriched).not.toHaveProperty('marklessCode');
});

test('an error frozen before it was thrown is enriched without throwing', () => {
	const error = Object.freeze(new Error('frozen'));

	const enriched = enrichRuntimeErrorForReporting(error, context);

	expect(enriched.message).toBe('frozen');
	expect(() => markRuntimeErrorReported(enriched)).not.toThrow();
});

test('reporting a DOMException to the host hands over the original error', () => {
	const error = new DOMException('no such node', 'NotFoundError');
	const host = globalThis as { reportError?: (error: unknown) => void };
	const previous = host.reportError;
	const reported: unknown[] = [];
	host.reportError = (value) => void reported.push(value);

	try {
		reportRuntimeErrorToHost(error, context);
	} finally {
		if (previous) host.reportError = previous;
		else delete host.reportError;
	}

	expect(reported).toEqual([error]);
	expect((reported[0] as Error).name).toBe('NotFoundError');
});
