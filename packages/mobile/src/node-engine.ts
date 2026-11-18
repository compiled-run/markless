import { randomBytes } from 'node:crypto';
import { createContext, runInContext } from 'node:vm';
import type { NativeScriptHost } from './runtime.ts';
import type { NativeScriptEngine } from './script-engine.ts';

/** The reference engine: a fresh V8 context with no web page and no Node globals, as JavaScriptCore and Hermes give a host. */
export function nodeScriptEngine(): NativeScriptEngine {
	const context = createContext({}, { microtaskMode: 'afterEvaluate' });
	return { evaluate: (source) => String(runInContext(source, context)) };
}

/**
 * A script host on the reference engine, as a phone's app has one: one engine for every screen, started the first time a
 * screen needs it; `starts` counts how often that happened. `seed` is fixed when given, so a test can pin `crypto`.
 */
export function nodeScriptHost(
	seed?: string,
): NativeScriptHost & { readonly starts: () => number } {
	let engine: NativeScriptEngine | undefined;
	let starts = 0;
	return {
		start: () => {
			if (!engine) {
				engine = nodeScriptEngine();
				starts++;
			}
			return engine;
		},
		seed: () => seed ?? randomBytes(32).toString('hex'),
		starts: () => starts,
	};
}
