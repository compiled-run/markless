/**
 * A bare `{expr}` written inside an `@if` arm sits in statement position, so the
 * parser hands the compiler a block holding one expression statement rather than
 * an expression container. Markup collection recognised only the container, so
 * such an arm compiled to a chunk with no statics and no slots - the branch site
 * then served an empty marker pair while attributes on the same element stayed
 * live. These pin the arm chunk carrying its slot, and the same shape inside a
 * handler body staying a real block.
 */
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import type { SemanticMarkupChunk } from '../src/artifacts.ts';

async function chunks(source: string): Promise<ReadonlyArray<SemanticMarkupChunk>> {
	const result = await compileTsrxModule({ filename: 'src/Page.tsrx', source, symbols: [] });
	expect(result.semanticGraph.diagnostics).toEqual([]);
	return result.renderData.chunks;
}

function arm(all: ReadonlyArray<SemanticMarkupChunk>, index: number): SemanticMarkupChunk {
	const found = all.find((chunk) => chunk.id === `branch:branch-site:0:arm:${index}`);
	if (!found) throw new Error(`Expected arm ${index}.`);
	return found;
}

test('a bare {children} arm carries the children read, not an empty chunk', async () => {
	const all = await chunks(`export default function Label({ children, fallback }) @{
	<output>
		@if (children) {
			{children}
		} @else {
			{fallback}
		}
	</output>
}
`);

	const [childrenSlot] = arm(all, 0).slots;
	expect(childrenSlot).toMatchObject({
		kind: 'text',
		raw: true,
		residue: { kind: 'graph-read', graphNodeId: 'prop:props', path: ['children'] },
	});

	const [fallbackSlot] = arm(all, 1).slots;
	expect(fallbackSlot).toMatchObject({ kind: 'text' });
	expect(arm(all, 1).statics[0]).toContain('markless-slot:0');
});

test('a bare arm expression reaches the template reads that drive refresh', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Page.tsrx',
		source: `import { state } from '@markless/core';

export default function Label({ children }) @{
	let count = state(0);

	<output>
		@if (children) {
			{children}
		} @else {
			{count}
		}
	</output>
}
`,
		symbols: [],
	});

	expect(result.semanticGraph.templateReads.map((read) => read.source)).toContain('count');
});

// The identical AST shape inside an arrow handler is a real block, and reading it
// as interpolation would turn a statement into rendered text.
test('a single-statement handler body stays a block', async () => {
	const all = await chunks(`import { state } from '@markless/core';

export default function Counter() @{
	let count = state(0);

	<button onClick={() => { count = count + 1 }}>{count}</button>
}
`);

	const template = all.find((chunk) => chunk.id === 'template:Counter');
	expect(template?.slots.filter((slot) => slot.kind === 'text').length).toBe(1);
});
