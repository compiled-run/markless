import { describe, expect, test } from 'vitest';
import {
	DEBUG_CHANNEL_SENTINELS,
	evaluateDebugChannelStrip,
} from '../src/strip-guarantee.ts';

describe('MLA-S4 strip guarantee', () => {
	test('passes when an unflagged artifact set contains no sentinel', () => {
		expect(
			evaluateDebugChannelStrip({
				debugEnabled: false,
				artifacts: [
					{ path: 'index.html', content: '<main>clean</main>' },
					{ path: 'build/chunk-a.js', content: 'export const value = 1;' },
				],
			}),
		).toEqual({ id: 'MLA-S4-STRIP-GUARANTEE', status: 'pass', details: [] });
	});

	test('fails an unflagged artifact and names its retained sentinel', () => {
		const result = evaluateDebugChannelStrip({
			debugEnabled: false,
			artifacts: [
				{ path: 'build/chunk-debug.js', content: DEBUG_CHANNEL_SENTINELS[2] },
			],
		});

		expect(result.status).toBe('fail');
		expect(result.details).toEqual([
			'build/chunk-debug.js retained debug-channel sentinel markless.debug.channel.v1.bootstrap',
		]);
	});

	test('uses sentinel presence as the flagged-build positive control', () => {
		expect(
			evaluateDebugChannelStrip({
				debugEnabled: true,
				artifacts: [
					{ path: 'index.html', content: 'markless.debug.channel.v1.bootstrap' },
				],
			}).status,
		).toBe('pass');
		expect(
			evaluateDebugChannelStrip({
				debugEnabled: true,
				artifacts: [{ path: 'index.html', content: '<main>missing</main>' }],
			}).status,
		).toBe('fail');
	});
});
