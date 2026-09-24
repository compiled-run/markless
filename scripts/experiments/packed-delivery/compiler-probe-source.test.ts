import { afterEach, expect, test } from 'vitest';
import { instrumentCompilerResult } from './compiler-probe-source.mjs';
const callbackKey = '__marklessCompilerResultProbe';
afterEach(() => {
	delete (globalThis as Record<string, unknown>)[callbackKey];
});
const source =
	'function compileTsrxModule(input) { return memoizedCompile(input, () => runCompile(input)); }';

test('observes compiler input/result without copying or modifying the artifact', async () => {
	const observations: unknown[] = [];
	(globalThis as Record<string, unknown>)[callbackKey] = (input: unknown, result: unknown) =>
		observations.push([input, result]);
	const artifact = Object.freeze({ symbols: ['symbol:one'] });
	const input = { filename: 'example.tsrx' };
	const result = instrumentCompilerResult(source);
	expect(result.matched).toBe(true);
	const compile = new Function(
		'memoizedCompile',
		'runCompile',
		result.source + ';return compileTsrxModule;',
	)(
		(_input: unknown, run: () => unknown) => Promise.resolve(run()),
		() => artifact,
	);
	expect(await compile(input)).toBe(artifact);
	expect(observations).toEqual([[input, artifact]]);
});

test('preserves compiler rejection and emits no successful record', async () => {
	const observations: unknown[] = [];
	(globalThis as Record<string, unknown>)[callbackKey] = (...args: unknown[]) =>
		observations.push(args);
	const error = new Error('compile failed');
	const result = instrumentCompilerResult(source);
	const compile = new Function(
		'memoizedCompile',
		'runCompile',
		result.source + ';return compileTsrxModule;',
	)(
		() => Promise.reject(error),
		() => {},
	);
	await expect(compile({})).rejects.toBe(error);
	expect(observations).toEqual([]);
});

test('leaves unrelated modules untouched and refuses ambiguous matches', () => {
	expect(instrumentCompilerResult('export const value=1')).toEqual({
		source: 'export const value=1',
		matched: false,
	});
	expect(() => instrumentCompilerResult(source + source)).toThrow(/multiple/);
});
