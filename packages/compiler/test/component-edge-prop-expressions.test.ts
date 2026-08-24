import { expect, test } from 'vitest';
import { compileTsrxModulesWithInterfaces } from './multi-module-compile-support.ts';

// A part of one family rendering another family's root, which is the composition
// every headless component library is built out of. What the child's `checked`
// reads is membership in the enclosing group's ticked set - an expression, not a
// node - so the edge has to mint the node that stands behind it.
const CHILD = `
import { shared, state } from '@markless/core';

export const boxState = shared(() => {
	const box = state({ checked: false, disabled: false });
	return {
		...box,
		toggle() {
			box.checked = !box.checked;
		},
	};
}, { scope: 'widget' });

export function BoxRoot({ checked = false, disabled = false, children }: { checked?: boolean; disabled?: boolean; children?: unknown }) @{
	const box = boxState();
	box.checked = checked;
	box.disabled = disabled;

	<div ui-checked={box.checked}>{children}</div>
}
`;

function parentSource(checkedExpression: string) {
	return `
import { shared, state } from '@markless/core';
import { BoxRoot } from './child.tsrx';

export const listState = shared(() => {
	const list = state({ value: [] as readonly string[], disabled: false });
	return {
		...list,
		setItem(itemValue: string, on: boolean) {
			list.value = on ? [...list.value, itemValue] : list.value.filter((held) => held !== itemValue);
		},
	};
}, { scope: 'widget' });

export function ListItem({ value, disabled, children }: { value: string; disabled?: boolean; children?: unknown }) @{
	const list = listState();
	const item = state({ value });

	<BoxRoot
		checked={${checkedExpression}}
		disabled={list.disabled || disabled === true}
	>{children}</BoxRoot>
}
`;
}

async function compileParent(checkedExpression: string) {
	const results = await compileTsrxModulesWithInterfaces([
		{ filename: 'src/child.tsrx', source: CHILD, importSource: './child.tsrx' },
		{ filename: 'src/parent.tsrx', source: parentSource(checkedExpression) },
	]);
	return results[results.length - 1]!;
}

function edgeProp(
	result: Awaited<ReturnType<typeof compileParent>>,
	name: string,
) {
	const edge = result.semanticGraph.componentEdges[0];
	return edge?.props.find((prop) => prop.name === name);
}

test('a method call on reads becomes the edge prop own computed', async () => {
	const result = await compileParent('list.value.includes(item.value)');
	const checked = edgeProp(result, 'checked');

	expect(checked?.kind).toBe('graph-reference');
	expect(checked && 'graphNodeId' in checked ? checked.graphNodeId : '').toMatch(
		/^computed:templateExpression:/,
	);

	const computed = result.semanticGraph.graphBindings.find(
		(binding) =>
			checked && 'graphNodeId' in checked && binding.id === checked.graphNodeId,
	);
	expect(computed?.functionSource).toBe('() => list.value.includes(item.value)');
	// Both sides of the membership question, so a write to either wakes the child.
	expect(computed?.dependencies?.map((dependency) => dependency.source)).toEqual([
		'list.value',
		'item.value',
	]);
	expect(result.semanticGraph.diagnostics).toEqual([]);
});

// The second half of the same seam: an operator expression over a shared read and
// a prop was already routable in a template position and is now routable here too.
test('an operator expression over a read and a prop routes at the edge', async () => {
	const result = await compileParent('list.value.includes(item.value)');
	const disabled = edgeProp(result, 'disabled');

	expect(disabled?.kind).toBe('graph-reference');
	expect(disabled && 'graphNodeId' in disabled ? disabled.graphNodeId : '').toMatch(
		/^computed:templateExpression:/,
	);
});

// The refusal that replaces the placeholder seed. `pick()` is a function whose
// body this pass cannot see, so there is nothing to subscribe - and seeding the
// child from it once would render the shared factory's placeholder forever.
test('a prop expression that reads state through an opaque call is refused', async () => {
	const result = await compileParent('pick(list.value)');
	const diagnostic = result.semanticGraph.diagnostics.find(
		(candidate) => candidate.code === 'MARKLESS_COMPONENT_PROP_EXPRESSION_UNSUPPORTED',
	);

	expect(diagnostic?.severity).toBe('error');
	expect(diagnostic?.message).toContain('checked');
	expect(diagnostic?.message).toContain('pick(list.value)');
	expect(diagnostic?.suggestions?.[0]?.message).toContain('computed()');
	// The prop is not recorded at all: a refused edge prop must not also ship.
	expect(edgeProp(result, 'checked')).toBeUndefined();
});

// The same opaque call with nothing reactive inside it is a plain value, and a
// plain value crossing an edge is not a bug - it stays opaque, with no refusal.
test('an opaque call that reads no state stays an opaque prop', async () => {
	const result = await compileParent('pick(1)');

	expect(edgeProp(result, 'checked')?.kind).toBe('opaque');
	expect(
		result.semanticGraph.diagnostics.filter(
			(candidate) => candidate.code === 'MARKLESS_COMPONENT_PROP_EXPRESSION_UNSUPPORTED',
		),
	).toEqual([]);
});

// The other side of the widening: nothing a later write can move is inside the
// expression, so no computed is minted for it. A self-composing component's
// `depth={depth - 1}` is exactly that shape, and minting a computed for it sent
// the child edge through a capture read the render evaluator never supplies.
test('an edge expression over props alone stays opaque and mints no computed', async () => {
	const results = await compileTsrxModulesWithInterfaces([
		{
			filename: 'src/tree-node.tsrx',
			source: `
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
`,
		},
	]);
	const tree = results[results.length - 1]!;
	const depth = tree.semanticGraph.componentEdges[0]?.props.find((prop) => prop.name === 'depth');

	expect(depth?.kind).toBe('opaque');
	// The edge expression itself, not the module: the `@if (depth > 0)` beside it
	// is a branch condition and mints its own computed so the arm can re-decide.
	expect(
		tree.semanticGraph.graphBindings.filter(
			(binding) =>
				binding.id.startsWith('computed:templateExpression:') &&
				binding.functionSource?.includes('depth - 1'),
		),
	).toEqual([]);
	expect(
		tree.semanticGraph.diagnostics.filter(
			(candidate) => candidate.code === 'MARKLESS_COMPONENT_PROP_EXPRESSION_UNSUPPORTED',
		),
	).toEqual([]);
});

// `{...rest}` on a CHILD COMPONENT tag. What crosses is the props object this
// component was handed, minus the names its signature took out of the rest
// binding — a build-time fact of the signature, so the consumer's `data-testid`
// reaches the element the composed child spreads onto.
test('a rest spread on a component tag crosses the edge as one prop binding', async () => {
	const results = await compileTsrxModulesWithInterfaces([
		{ filename: 'src/child.tsrx', source: CHILD, importSource: './child.tsrx' },
		{
			filename: 'src/parent.tsrx',
			source: `
import { BoxRoot } from './child.tsrx';

export function Wrapper({ disabled, children, ...rest }) @{
	<BoxRoot {...rest} disabled={disabled}>{children}</BoxRoot>
}
`,
		},
	]);
	const wrapper = results[results.length - 1]!;
	const props = wrapper.semanticGraph.componentEdges[0]?.props ?? [];
	const spread = props[0];

	expect(spread?.kind).toBe('spread');
	expect(spread && 'graphNodeId' in spread ? spread.graphNodeId : '').toBe('prop:props');
	expect(spread && 'excludeNames' in spread ? [...spread.excludeNames].sort() : []).toEqual([
		'children',
		'disabled',
	]);
	// Written first on the tag, so the props the tag names itself still win.
	expect(props.map((prop) => prop.name)).toEqual(['...rest', 'disabled']);
	expect(wrapper.semanticGraph.diagnostics).toEqual([]);
});

// Fail closed, never drop: an object assembled anywhere but the signature has no
// build-time contents, so the child would silently render without them.
test('a spread of anything but the props rest binding is refused', async () => {
	const results = await compileTsrxModulesWithInterfaces([
		{ filename: 'src/child.tsrx', source: CHILD, importSource: './child.tsrx' },
		{
			filename: 'src/parent.tsrx',
			source: `
import { BoxRoot } from './child.tsrx';

export function Wrapper({ children }) @{
	const extra = { 'data-kind': 'card' };

	<BoxRoot {...extra}>{children}</BoxRoot>
}
`,
		},
	]);
	const wrapper = results[results.length - 1]!;
	const diagnostic = wrapper.semanticGraph.diagnostics.find(
		(candidate) => candidate.code === 'MARKLESS_COMPONENT_SPREAD_UNSUPPORTED',
	);

	expect(diagnostic?.severity).toBe('error');
	expect(diagnostic?.message).toContain('extra');
	expect(wrapper.semanticGraph.componentEdges[0]?.props).toEqual([]);
});

// Hardcoding resistance: the same structure with every name, element, member and
// method changed still mints the computed and still names both reads.
test('the edge computed is selected from structure, not from names', async () => {
	const results = await compileTsrxModulesWithInterfaces([
		{
			filename: 'src/panel.tsrx',
			source: `
import { shared, state } from '@markless/core';

export const panelState = shared(() => {
	const panel = state({ open: false });
	return { ...panel };
}, { scope: 'widget' });

export function PanelRoot({ open = false, children }: { open?: boolean; children?: unknown }) @{
	const panel = panelState();
	panel.open = open;

	<section ui-open={panel.open}>{children}</section>
}
`,
			importSource: './panel.tsrx',
		},
		{
			filename: 'src/tabs.tsrx',
			source: `
import { shared, state } from '@markless/core';
import { PanelRoot } from './panel.tsrx';

export const tabsState = shared(() => {
	const tabs = state({ opened: [] as readonly string[] });
	return { ...tabs };
}, { scope: 'widget' });

export function TabsPanel({ id, children }: { id: string; children?: unknown }) @{
	const tabs = tabsState();
	const panel = state({ id });

	<PanelRoot open={tabs.opened.indexOf(panel.id) >= 0}>{children}</PanelRoot>
}
`,
		},
	]);
	const tabs = results[results.length - 1]!;
	const open = tabs.semanticGraph.componentEdges[0]?.props.find((prop) => prop.name === 'open');

	expect(open?.kind).toBe('graph-reference');
	const computed = tabs.semanticGraph.graphBindings.find(
		(binding) => open && 'graphNodeId' in open && binding.id === open.graphNodeId,
	);
	expect(computed?.dependencies?.map((dependency) => dependency.source)).toEqual([
		'tabs.opened',
		'panel.id',
	]);
});
