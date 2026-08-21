import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { sameModuleSsrComponentNames } from '../src/passes/public-render/same-module.ts';

// T053-B: a PLAIN component (no shared(), no widget) that composes ITSELF behind
// a PROP-decided arm. The chunk graph has a cycle; how far it unrolls is a
// render-time answer. The semantic-graph pass plans it, and no pass refuses it.
// The public-render pass then emits a child case that renders through a local it
// never declares, because a module's own root component is never emitted as one
// of that module's same-module children. Nothing names the gap: there is no
// diagnostic, so a self-composing component renders exactly one level.
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

async function compile(source: string) {
	return compileTsrxModule({
		filename: 'src/tree-node.tsrx',
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

test('public render emits the self edge against a child surface it never declares', async () => {
	const compiled = await compile(selfComposing);
	const source = compiled.publicRenderModule.ssrModuleSource ?? '';

	// The child case IS emitted, and it renders through `__marklessSsrComponent0`.
	expect(source).toContain('case "component-edge:0"');
	expect(source).toContain('await __marklessSsrComponent0?.renderSsr?.(');
	// That local is never bound: a same-module child is declared by
	// emitSameModuleSsrComponents, which excludes the module's own root, and an
	// imported one by an import, which a same-module edge never gets. The one
	// mention in the module is the read above.
	expect(source.split('__marklessSsrComponent0').length - 1).toBe(1);
	expect(source).not.toContain('const __marklessSsrComponent0');
	expect(source).not.toContain('import __marklessSsrComponent0');
});

test('the same-module child list is where the self edge is lost', async () => {
	const compiled = await compile(selfComposing);
	const ast = { type: 'Program' } as never;

	// Every same-module child of this module, as the SSR emitter enumerates them:
	// the root component is excluded by name, and the root component is the only
	// component this module declares.
	expect(sameModuleSsrComponentNames(compiled as never, ast, 'TreeNode')).toEqual([]);
	expect(compiled.semanticGraph.components.map((component) => component.name)).toEqual([
		'TreeNode',
	]);
});
