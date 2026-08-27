import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import {
	componentEdgeSymbolRoutes,
	importedSymbolRoutes,
} from '../src/component-edge-instance.ts';
import { sameModuleSsrComponentNames } from '../src/passes/public-render/same-module.ts';

// T055: a PLAIN component (no shared(), no widget) that composes ITSELF behind a
// PROP-decided arm. The chunk graph has a cycle, and how far it unrolls is a
// render-time answer: the emitted module reaches its own render function through
// the same child call any imported child takes, so each level is one more
// component edge with its own `c<n>:` node identity, state, and symbol route.
// recursive-self-composition.test.ts in packages/vitest-browser pins the
// rendered consequence.

const selfComposing = `
import { state } from '@markless/core';

export default function TreeNode({ depth }) @{
	let count = state(0);

	<div data-tree-node data-depth={depth}>
		<button type="button" data-tree-bump onClick={() => count++}>{count}</button>
		@if (depth > 0) {
			<TreeNode depth={depth - 1} />
		}
	</div>
}
`;

// The same shape with every authored name, element, attribute, and prop changed:
// nothing may be selected by the fixture's own spelling.
const alternateSelfComposing = `
import { state } from '@markless/core';

export default function Crumb({ left }) @{
	let hits = state(0);

	<section data-crumb data-left={left}>
		<a href="#" data-crumb-hit onClick={() => hits++}>{hits}</a>
		@if (left > 0) {
			<Crumb left={left - 1} />
		}
	</section>
}
`;

// Two components of ONE module composing each other: the cycle runs through the
// module's own root, which is the same edge shape as direct self-composition.
const mutualSameModule = `
export default function Outer({ depth }) @{
	<div data-outer data-depth={depth}>
		@if (depth > 0) {
			<Inner depth={depth} />
		}
	</div>
}

export function Inner({ depth }) @{
	<span data-inner>
		<Outer depth={depth - 1} />
	</span>
}
`;

// The outer call site and the self call site live in ONE module, so the prop has
// a compile-time value at the outer edge and a per-level value at the self edge.
const foldableSelfCompose = `
export default function Page() @{
	<main><Node depth={3} /></main>
}

export function Node({ depth }) @{
	<div data-node data-depth={depth}>
		@if (depth > 1) {
			<Node depth={depth - 1} />
		}
	</div>
}
`;

// The same shape with the recursion removed: the arm still passes the prop down,
// so the read is still routed through an edge, but ONE call site now means one
// runtime instance and the literal really is the value every instance receives.
const foldableNoRecursion = `
export default function Page() @{
	<main><Node depth={3} /></main>
}

export function Node({ depth }) @{
	<div data-node data-depth={depth}>
		@if (depth > 1) {
			<Leaf depth={depth - 1} />
		}
	</div>
}

export function Leaf({ depth }) @{
	<span data-leaf data-leaf-depth={depth}>leaf</span>
}
`;

async function compile(source: string, filename = 'src/tree-node.tsrx') {
	return compileTsrxModule({
		filename,
		source,
		buildId: 'b',
		resolverId: 'r',
		symbols: [],
	});
}

test('the semantic graph plans the self edge, and no pass refuses the cycle', async () => {
	const compiled = await compile(selfComposing);

	// No diagnostic: cycle detection, import resolution, and chunk planning all
	// accept a component that names itself.
	expect(compiled.diagnostics ?? []).toEqual([]);
	// One component edge, with no import source: a SAME-MODULE child that happens
	// to be the module's own root component.
	expect(
		compiled.semanticGraph.componentEdges.map((edge) => ({
			child: edge.childComponentName,
			importSource: edge.importSource,
		})),
	).toEqual([{ child: 'TreeNode', importSource: undefined }]);
	// The arm holds it: a prop-decided arm, so nothing flips at runtime and
	// MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED never fires.
	const armChunk = compiled.renderData.chunks.find((chunk) =>
		chunk.slots.some(
			(slot) => slot.kind === 'child-component' && slot.componentEdgeId === 'component-edge:0',
		),
	);
	expect(armChunk?.id).toBe('branch:branch-site:0:arm:0');
});

test.each([
	['tree', selfComposing],
	['alternate', alternateSelfComposing],
])('public render binds the root as its own child surface (%s)', async (_name, source) => {
	const compiled = await compile(source);
	const emitted = compiled.publicRenderModule.ssrModuleSource ?? '';

	// The child case renders through the same local an imported child would use,
	// and that local now names the module's own render function.
	expect(emitted).toContain('case "component-edge:0"');
	expect(emitted).toContain('await __marklessSsrComponent0?.renderSsr?.(');
	expect(emitted).toContain('const __marklessSsrComponent0 = { renderSsr: marklessRenderSsr };');
	// Depth is render-time: exactly one render function is emitted for the
	// component, re-entered per level, never one copy per level.
	expect(emitted.split('async function marklessRenderSsr(').length - 1).toBe(1);
	// The root is still not one of the module's same-module CHILD components: it
	// is reached as itself, not emitted a second time under a child name.
	expect(
		sameModuleSsrComponentNames(compiled as never, { type: 'Program' } as never, 'TreeNode'),
	).toEqual([]);
});

test('each level renders under its own instance path, so its nodes and state are its own', async () => {
	const compiled = await compile(selfComposing);
	const emitted = compiled.publicRenderModule.ssrModuleSource ?? '';

	// The self edge carries the ordinary composed-child identity: the child's
	// hosts are minted under `c0:` and its symbols are routed under `c0:`, which
	// is what makes level 2's counter a different cell from level 1's.
	expect(emitted).toContain('"hostPrefix":"c0:"');
	expect(emitted).toContain('"symbolPrefix":"c0:"');
	expect(emitted).toContain('idPrefix:marklessSsrIdPrefix+child.hostPrefix');
	// Each level clones the payload state for itself rather than sharing one map.
	expect(emitted).toContain('const marklessSsrRenderStateValues = new Map(marklessSsrStateValues);');
});

test('a cyclic same-module route re-enters this module rather than stripping once', async () => {
	const compiled = await compile(selfComposing);
	const routes = componentEdgeSymbolRoutes(compiled, undefined);

	// One rendered level per segment, so `c0:c0:symbol:0` must strip twice. A
	// route back into this module's own symbol surface strips one segment per
	// pass; the old self route dropped straight to the local resolver and
	// rejected everything below the first level.
	expect(routes).toEqual([
		{
			prefix: 'c0:',
			importSource: './tree-node.tsrx',
			selfRecursive: true,
			componentEdgeId: 'component-edge:0',
		},
	]);
	// It names this module, so it is not a child to link: the manifest stays a
	// list of other modules.
	expect(importedSymbolRoutes(routes)).toEqual([]);
});

test('a same-module cycle through two components routes recursively too', async () => {
	const compiled = await compile(mutualSameModule, 'src/outer.tsrx');

	expect(compiled.diagnostics ?? []).toEqual([]);
	expect(
		componentEdgeSymbolRoutes(compiled, undefined).map((route) => ({
			prefix: route.prefix,
			recursive: 'selfRecursive' in route && route.selfRecursive === true,
		})),
	).toEqual([
		{ prefix: 'c0:', recursive: true },
		{ prefix: 'c1:', recursive: true },
	]);
});

function depthSlot(compiled: Awaited<ReturnType<typeof compile>>, symbolKind: string) {
	return compiled.captureAnalysis.extractedSymbols.find((symbol) => symbol.kind === symbolKind)
		?.captureSlots[0];
}

test('the self edge answers the prop per instance, so the outer literal cannot stand for every level', async () => {
	const compiled = await compile(foldableSelfCompose, 'src/page.tsrx');
	const slot = depthSlot(compiled, 'sync-computed-derive');

	// The outer literal is gone from the slot: it was only ever level 1's value,
	// and the base symbol it folded into is the code every level runs. What is
	// left is the per-instance read, which is right at every level.
	expect(slot?.routes).toEqual([
		{ kind: 'graph-reference', graphNodeId: 'prop:props', path: ['depth'] },
	]);
});

test('the emitted derive reads the slot rather than baking the outermost literal', async () => {
	const compiled = await compile(foldableSelfCompose, 'src/page.tsrx');
	const slot = depthSlot(compiled, 'sync-computed-derive');
	const derive = compiled.symbolModules.modules.find(
		(candidate) => candidate.kind === 'sync-computed-derive',
	);

	expect(slot?.id).toBeDefined();
	expect(derive?.source).toContain('context.graph.read("prop:props", ["depth"])');
	// The bug this pins: with the self edge's route missing, the slot looked
	// all-constant and the derive emitted `3 > 1` — true at every level, so the
	// recursion never terminated.
	expect(derive?.source).not.toContain('3 > 1');
});

test('one call site with no recursion still folds its constant', async () => {
	const compiled = await compile(foldableNoRecursion, 'src/page.tsrx');
	const slot = depthSlot(compiled, 'sync-computed-derive');
	const derive = compiled.symbolModules.modules.find(
		(candidate) => candidate.kind === 'sync-computed-derive',
	);

	expect(slot?.routes.map((route) => route.kind)).toEqual(['compiler-known-constant']);
	expect(derive?.source).toContain('3 > 1');
});

test('the non-recursive derive keeps its folded bytes exactly', async () => {
	const compiled = await compile(foldableNoRecursion, 'src/page.tsrx');
	const derive = compiled.symbolModules.modules.find(
		(candidate) => candidate.kind === 'sync-computed-derive',
	);

	// Byte discipline: widening the unsound case must not cost the sound one a
	// single character, so the whole emitted derive is pinned, not just a substring.
	expect(derive?.source).toBe(
		'export const authoredSource = "() => depth > 1";\n\nexport function symbol_2(context) {\n  return 3 > 1;\n}\n',
	);
});

test('a same-module child that closes no cycle keeps its plain local route', async () => {
	const compiled = await compile(
		`export default function Page() @{
	<main><Panel /></main>
}

export function Panel() @{
	<aside data-panel>panel</aside>
}
`,
		'src/page.tsrx',
	);

	// Nothing re-enters: one strip reaches this module's own resolver, so the
	// route stays the cheap local one and imports nothing.
	expect(componentEdgeSymbolRoutes(compiled, undefined)).toEqual([
		{ prefix: 'c0:', self: true, componentEdgeId: 'component-edge:0' },
	]);
});
