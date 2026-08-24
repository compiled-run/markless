/**
 * A branch condition that recombines PROP reads has to carry a real graph read,
 * exactly as the same shape over `state()` does.
 *
 * A prop is not settled by the render that read it: the parent can pass a live
 * graph reference, and every part in a component family guards on one
 * (`@if (children === undefined)`, `@if (count === 0)`). With no minted node the
 * site recorded `testReads: []`, the served SSR module inlined the authored text
 * into `selectBranchArm`, and composition dropped the branch from the payload as
 * "decided by a static prop" - so the arm rendered once and then froze while the
 * parent's cell moved.
 */
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const PROP_AND_STATE = `
import { state } from '@markless/core';

export function Label({ count, children }) @{
	<output>
		@if (count === 0) { <span data-zero>none</span> } @else { <span data-some>{count}</span> }
	</output>
}

export function Absent({ children }) @{
	<output>
		@if (children === undefined) { <span data-empty>empty</span> } @else { <span>{children}</span> }
	</output>
}

export default function Page() @{
	let n = state(0);

	<main>
		<button type="button" onClick={() => n++}>bump</button>
		@if (n === 0) { <p data-local>local</p> }
	</main>
}
`;

async function compileFixture() {
	return await compileTsrxModule({
		filename: 'fixture.tsrx',
		source: PROP_AND_STATE,
		buildId: 'b',
		resolverId: 'r',
		symbols: [],
	});
}

function branchesOf(compiled: Awaited<ReturnType<typeof compileFixture>>, name: string) {
	return (
		compiled.publicRenderModule.componentDefinitions.find(
			(definition) => definition.name === name,
		)?.branches ?? []
	);
}

test('a prop-composite condition mints the same synthetic computed a state one does', async () => {
	const compiled = await compileFixture();
	const overProp = branchesOf(compiled, 'Label')[0];
	const overState = branchesOf(compiled, 'Page')[0];

	expect(overProp?.testSource).toBe('count === 0');
	expect(overProp?.testComputedGraphNodeId).toMatch(/^computed:templateExpression:\d+$/);
	expect(overProp?.testReads).toEqual([
		{ graphNodeId: overProp?.testComputedGraphNodeId, path: [] },
	]);
	// The shape the two positions have to share: one node, no path, on both sides.
	expect(overState?.testReads).toEqual([
		{ graphNodeId: overState?.testComputedGraphNodeId, path: [] },
	]);
});

test('an undefined-children guard carries the prop read the parent can route', async () => {
	const compiled = await compileFixture();
	const branch = branchesOf(compiled, 'Absent')[0];
	const node = compiled.protocolState.computed.find(
		(candidate) => candidate.graphNodeId === branch?.testComputedGraphNodeId,
	);

	expect(branch?.testSource).toBe('children === undefined');
	// The dependency is what composition rewrites onto the parent's node, so a
	// live `children` route wakes the guard instead of freezing it.
	expect(node?.dependencies?.map((dependency) => [dependency.graphNodeId, dependency.path])).toEqual([
		['prop:props', ['children']],
	]);
	expect(node?.deriveSymbolId).toBeDefined();
});

test('the served module reads the minted node instead of inlining the authored text', async () => {
	const compiled = await compileFixture();
	const ssr = compiled.publicRenderModule.ssrModuleSource;
	const label = branchesOf(compiled, 'Label')[0];

	expect(ssr).toContain(`marklessSsrRenderStateValues.get("${label?.testComputedGraphNodeId}")`);
	// The authored text is the staleness bug: an inlined `(count === 0)` decides
	// the arm from the destructured local and leaves no node to re-decide from.
	expect(ssr).not.toContain('const arm=((count === 0)?0:1)');
	// It seeds that node from the props this render was handed.
	expect(ssr).toContain(`marklessSsrRenderStateValues.set("${label?.testComputedGraphNodeId}",(() => count === 0)())`);
});
