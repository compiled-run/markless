import { expect, test } from 'vitest';
import { buildSemanticGraph } from '../src/index.ts';

const codesFor = async (initial: string) =>
	(
		await buildSemanticGraph({
			filename: 'src/Handlers.tsrx',
			source: `import { state } from '@markless/core';
const pick = () => 1;
export function App() @{
	let handlers = state(${initial});
	let out = state(0);
	<button onClick={() => { out = 1; }}>{out}</button>
}`,
		})
	).diagnostics.map((diagnostic) => diagnostic.code);

test.each([
	['an arrow function', '{ fn: () => 1 }'],
	['a function expression in an array', '[function () { return 1; }]'],
	['a method', '{ run() { return 1; } }'],
	['a nested arrow', '{ deep: { fn: () => 1 } }'],
	['a bare arrow', '() => 1'],
])('a state() value holding %s fails the build', async (_, initial) => {
	expect(await codesFor(initial)).toContain('MARKLESS_STATE_FUNCTION_UNSERIALIZABLE');
});

test.each([
	['plain data', "{ name: 'pick', count: 1, tags: ['a'] }"],
	['the result of a call', 'pick()'],
])('a state() value holding %s is data', async (_, initial) => {
	expect(await codesFor(initial)).not.toContain('MARKLESS_STATE_FUNCTION_UNSERIALIZABLE');
});

test('the refusal names the function and the state in author terms', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/Handlers.tsrx',
		source: `import { state } from '@markless/core';
export function App() @{
	let handlers = state({ fn: () => 1 });
	<p>{handlers.fn === undefined ? 'none' : 'some'}</p>
}`,
	});
	expect(graph.diagnostics).toContainEqual(
		expect.objectContaining({
			code: 'MARKLESS_STATE_FUNCTION_UNSERIALIZABLE',
			severity: 'error',
			message: expect.stringContaining('state "handlers" holds a function, `() => 1`'),
		}),
	);
});
