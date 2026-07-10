import { describe, expect, test, vi } from 'vitest';
import { runBoxWithVerdict } from '../boxes/witness-verdict.ts';

describe('witness verdict helper', () => {
	test('emits a failing verdict before rethrowing a box error', async () => {
		const emit = vi.fn(async () => undefined);
		const failure = new Error('strip assertion failed');

		await expect(
			runBoxWithVerdict(
				{ name: 'debug strip', tags: ['debug-channel'], receiptPath: 'strip.json' },
				async () => {
					throw failure;
				},
				emit,
			)(undefined as never),
		).rejects.toBe(failure);
		expect(emit).toHaveBeenCalledWith({
			name: 'debug strip',
			tags: ['debug-channel'],
			receiptPath: 'strip.json',
			passed: false,
			details: ['strip assertion failed'],
		});
	});
});
