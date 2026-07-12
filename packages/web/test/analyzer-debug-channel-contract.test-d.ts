import type { AnalyzerRequiredDebugChannel } from '../../analyzer/src/debug-channel-contract.ts';
import type { MarklessDebugChannelV1 } from '../src/debug-channel.ts';

declare const emittedDebugChannel: MarklessDebugChannelV1;

emittedDebugChannel satisfies AnalyzerRequiredDebugChannel<Element>;
