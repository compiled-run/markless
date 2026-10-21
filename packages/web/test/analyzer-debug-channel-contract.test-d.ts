import { test } from 'vitest';
import type { AnalyzerRequiredDebugChannel } from '../../analyzer/src/debug-channel-contract.ts';
import type { MarklessDebugChannelV1 } from '../src/debug-channel.ts';

declare const emittedDebugChannel: MarklessDebugChannelV1;

test('the emitted debug channel satisfies the channel the analyzer requires', () => {
	emittedDebugChannel satisfies AnalyzerRequiredDebugChannel<Element>;
});
