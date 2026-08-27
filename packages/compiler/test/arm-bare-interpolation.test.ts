/**
 * Template output is an element, a fragment, or a control-flow construct — a
 * standalone expression container is none of those. A bare `{expr}` written as
 * an arm's whole body parses as a block holding one expression statement, and
 * compiling it as interpolation left the arm's text bound to the element around
 * the branch, which erases whatever the other arm rendered there. These pin the
 * refusal with its fragment hint, the fragment spelling compiling clean, and
 * the identical shape inside a handler body staying a real block.
 */
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import type { SemanticMarkupChunk } from '../src/artifacts.ts';
import {
	BARE_ARM_INTERPOLATION_CODE,
	BARE_ARM_INTERPOLATION_SEVERITY,
} from '../src/passes/semantic-graph/diagnostics.ts';

async function compile(source: string) {
	return compileTsrxModule({ filename: 'src/Page.tsrx', source, symbols: [] });
}

async function chunks(source: string): Promise<ReadonlyArray<SemanticMarkupChunk>> {
	const result = await compile(source);
	expect(result.semanticGraph.diagnostics).toEqual([]);
	return result.renderData.chunks;
}

function arm(all: ReadonlyArray<SemanticMarkupChunk>, index: number): SemanticMarkupChunk {
	const found = all.find((chunk) => chunk.id === `branch:branch-site:0:arm:${index}`);
	if (!found) throw new Error(`Expected arm ${index}.`);
	return found;
}

test('a bare {expr} arm is refused with the fragment spelling as the hint', async () => {
	const result = await compile(`export default function Label({ children, fallback }) @{
	<output>
		@if (children) {
			{children}
		} @else {
			{fallback}
		}
	</output>
}
`);

	const refusals = result.semanticGraph.diagnostics.filter(
		(diagnostic) => diagnostic.code === BARE_ARM_INTERPOLATION_CODE,
	);
	expect(refusals).toHaveLength(2);
	expect(refusals[0]).toMatchObject({ severity: BARE_ARM_INTERPOLATION_SEVERITY });
	expect(refusals.map((diagnostic) => diagnostic.suggestions?.[0]?.message)).toEqual([
		'Wrap it in a fragment: <>{children}</>',
		'Wrap it in a fragment: <>{fallback}</>',
	]);
});

test('a fragment arm compiles clean and carries its own text slot', async () => {
	const all = await chunks(`export default function Label({ children, fallback }) @{
	<output>
		@if (children) {
			<>{children}</>
		} @else {
			<>{fallback}</>
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

test('a fragment arm expression reaches the template reads that drive refresh', async () => {
	const result = await compile(`import { state } from '@markless/core';

export default function Label({ children }) @{
	let count = state(0);

	<output>
		@if (children) {
			<>{children}</>
		} @else {
			<>{count}</>
		}
	</output>
}
`);

	expect(result.semanticGraph.diagnostics).toEqual([]);
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
