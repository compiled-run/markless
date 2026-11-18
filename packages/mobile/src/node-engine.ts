import { randomBytes } from 'node:crypto';
import { createContext, runInContext } from 'node:vm';
import type { NativeScriptHost } from './runtime.ts';
import type { NativeScriptEngine } from './script-engine.ts';

/** The reference engine: a fresh V8 context with no web page and no Node globals, as JavaScriptCore and Hermes give a host. */
export function nodeScriptEngine(): NativeScriptEngine {
	const context = createContext({}, { microtaskMode: 'afterEvaluate' });
	return { evaluate: (source) => String(runInContext(source, context)) };
}

/** A script host on the reference engine; `seed` is fixed when given, so a test can pin what `crypto` draws. */
export const nodeScriptHost = (seed?: string): NativeScriptHost => ({
	start: nodeScriptEngine,
	seed: () => seed ?? randomBytes(32).toString('hex'),
});
