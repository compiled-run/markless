import { expect, test } from 'vitest';
import { compileModule, type CompiledModule } from './support.ts';

/**
 * The tree's real shape: the row part and the group part each declare
 * `const isShowing = computed(...)` over a different formula, and only the row's
 * formula knows about `leaf`. The served render derives those locals itself, so
 * a module-wide name lookup there hands the row the group's leaf-blind formula
 * and a leaf row is served `aria-expanded` on a `treeitem` that has no group.
 */
const TREE = `
import { computed, shared, state } from '@markless/core';

export const treeItemState = shared(
	() => {
		const item = state({ open: false, leaf: false });
		return { ...item };
	},
	{ scope: 'widget' },
);

export function TreeItem({ open = false, leaf = false, children }) @{
	const item = treeItemState();
	item.open = open;
	item.leaf = leaf;
	const isShowing = computed(() => item.leaf !== true && item.open === true);

	<div role="treeitem" aria-expanded={isShowing ? 'true' : undefined} ui-open={isShowing}>{children}</div>
}

export function TreeItemContent({ children }) @{
	const item = treeItemState();
	const isShowing = computed(() => item.open === true);

	<div role="group" hidden={isShowing !== true} ui-open={isShowing}>{children}</div>
}
`;

function ssrFunctionBody(compiled: CompiledModule, functionName: string): string {
	const source = compiled.publicRenderModule.ssrModuleSource ?? '';
	const start = source.indexOf(`async function ${functionName}(`);
	if (start < 0) throw new Error(`No served render named ${functionName}.`);
	const end = source.indexOf('\n}\n', start);
	return source.slice(start, end < 0 ? undefined : end);
}

function readPublicPath(value: unknown, path: ReadonlyArray<string>): unknown {
	return path.reduce<unknown>(
		(current, key) => (current as Record<string, unknown> | undefined)?.[key],
		value,
	);
}

/**
 * Runs one served render's value prelude — its derived locals and the graph
 * values it publishes — over a seeded shared item, and answers what the given
 * graph node serves. The render's own markup pass needs @markless/web, so this
 * evaluates the lines that decide the attribute, not the HTML around them.
 */
function servedValue(
	compiled: CompiledModule,
	functionName: string,
	seed: Record<string, unknown>,
	graphNodeId: string,
): unknown {
	const body = ssrFunctionBody(compiled, functionName);
	const prelude = body
		.split('\n')
		.map((line) => line.trim())
		.filter(
			(line) =>
				/^(?:const|let) \w+ = \(/.test(line) ||
				line.includes('marklessSsrRenderStateValues.set("computed:'),
		);
	const stateValues = new Map<string, unknown>();
	for (const [, id] of body.matchAll(/marklessSsrRenderStateValues\.get\("([^"]+)"\)/g))
		stateValues.set(id, seed);

	const run = new Function(
		'marklessSsrReadPublicPath',
		'marklessSsrRenderStateValues',
		`${prelude.join('\n')}\nreturn marklessSsrRenderStateValues.get(${JSON.stringify(graphNodeId)});`,
	) as (read: typeof readPublicPath, values: Map<string, unknown>) => unknown;
	return run(readPublicPath, stateValues);
}

function attributeNodeId(
	compiled: CompiledModule,
	componentName: string,
	attribute: string,
): string {
	const slot = compiled.renderData.chunks
		.find((chunk) => chunk.componentName === componentName)
		?.slots?.find((candidate) => candidate.kind === 'attribute' && candidate.name === attribute);
	if (!slot || !('residue' in slot) || slot.residue.kind !== 'graph-read')
		throw new Error(`No "${attribute}" attribute read on ${componentName}.`);
	return slot.residue.graphNodeId;
}

test('SSR: a row that is both leaf and open is served no aria-expanded', async () => {
	const compiled = await compileModule('src/tree.tsrx', TREE);
	const expanded = attributeNodeId(compiled, 'TreeItem', 'aria-expanded');

	expect(servedValue(compiled, 'marklessRenderSsr', { open: true, leaf: true }, expanded)).toBe(
		undefined,
	);
	expect(servedValue(compiled, 'marklessRenderSsr', { open: true, leaf: false }, expanded)).toBe(
		'true',
	);
});

test('SSR: the group part keeps its own leaf-blind formula', async () => {
	const compiled = await compileModule('src/tree.tsrx', TREE);
	const open = attributeNodeId(compiled, 'TreeItemContent', 'ui-open');

	expect(
		servedValue(compiled, 'marklessRenderSsrTreeItemContent', { open: true, leaf: true }, open),
	).toBe(true);
});
