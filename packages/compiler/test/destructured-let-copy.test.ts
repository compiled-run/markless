import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const compile = (handler: string) =>
	compileTsrxModule({
		filename: 'src/Copy.tsrx',
		source: `import { state } from '@markless/core';
export function App() @{
	let obj = state({ a: 1, b: 10, tags: ['x'] });
	let { a } = obj;
	<button onClick={() => { ${handler} }}>{a}{obj.b}</button>
}`,
		symbols: [],
		omitAuthoredSource: true,
	});

test('a reassigned let destructured from state is a local copy, and its write stays local', async () => {
	const result = await compile('let { b } = obj; b++; obj.a = b;');
	expect(result.semanticGraph.aliases.map((alias) => alias.name)).toEqual(['a']);
	expect(result.stateLowering.diagnostics).toEqual([]);
	expect(result.stateLowering.writes.map((write) => write.path)).toEqual([['a']]);
});

test('a let destructured from state and never reassigned still names the state path', async () => {
	const result = await compile('let { tags } = obj; tags.push("y");');
	expect(result.semanticGraph.aliases.map((alias) => alias.name)).toEqual(['a', 'tags']);
	expect(result.stateLowering.writes.map((write) => write.path)).toEqual([['tags']]);
});
