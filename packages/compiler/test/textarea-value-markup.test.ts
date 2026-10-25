import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

async function templateChunk(markup: string) {
	const result = await compileTsrxModule({
		filename: 'src/Notes.tsrx',
		source: `
import { state } from '@markless/core';

export default function Notes() @{
	let draft = state('Hello');

	<main>${markup}</main>
}
`,
		symbols: [],
	});
	return result.semanticGraph.markup.chunks.find((chunk) => chunk.kind === 'template')!;
}

test('a textarea value renders as the textarea text, not as an attribute', async () => {
	const chunk = await templateChunk('<textarea value={draft}></textarea>');
	expect(chunk.statics.join('|')).toBe('<main><textarea>|</textarea></main>');
	expect(chunk.slots).toEqual([
		expect.objectContaining({
			kind: 'attribute',
			name: 'value',
			alwaysPresent: true,
			residue: { kind: 'graph-read', graphNodeId: 'state:draft', path: [] },
		}),
	]);
});

test('a literal textarea value is escaped text content', async () => {
	const chunk = await templateChunk('<textarea rows={2} value="a < b"></textarea>');
	expect(chunk.statics.join('|')).toBe('<main><textarea rows="2">a &lt; b</textarea></main>');
});

test('an input keeps value as its attribute', async () => {
	const chunk = await templateChunk('<input value={draft} />');
	expect(chunk.statics.join('|')).toBe('<main><input|></main>');
});
