import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// The factory's state local (`s`) and the component's shared-instance local
// (`s`) share a name on purpose: a widget family names both after the family.
const familySource = `
import { shared, state, computed } from '@markless/core';

export const spike = shared(() => {
	const s = state({ checked: true, disabled: false });
	const isChecked = computed(() => s.checked === true);

	return {
		...s,
		isChecked,
		toggle() { s.checked = !s.checked; },
	};
}, { scope: 'widget' });

export function Root(props) @{
	const s = spike();
	s.disabled = props.disabled ?? false;

	<div data-spike-root ui-disabled={s.disabled}>{props.children}</div>
}

export function Box() @{
	const s = spike();

	<button type="button" data-box ui-checked={s.isChecked} onClick={() => s.toggle()}>x</button>
}
`;

async function compile(filename: string, source: string) {
	return compileTsrxModule({
		filename,
		source,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
}

test('a template read of a factory-returned computed resolves to the computed node', async () => {
	const compiled = await compile('src/spike.tsrx', familySource);
	const template = compiled.renderData.chunks.find((chunk) => chunk.id === 'template:Box');
	const slot = template?.slots.find(
		(candidate) => candidate.kind === 'attribute' && candidate.name === 'ui-checked',
	);

	expect(slot && 'residue' in slot ? slot.residue : null).toEqual({
		kind: 'graph-read',
		graphNodeId: 'shared:src/spike.tsrx#spike/computed:isChecked',
		path: [],
	});
});

test('a widget part that reads a factory computed derives it during SSR', async () => {
	const compiled = await compile('src/spike.tsrx', familySource);

	expect(compiled.publicRenderModule.ssrModuleSource).toContain(
		'marklessSsrRenderStateValues.set("shared:src/spike.tsrx#spike/computed:isChecked"',
	);
});

test('a component-body seed of shared state leaves no factory local in the SSR body', async () => {
	const compiled = await compile('src/spike.tsrx', familySource);

	expect(compiled.publicRenderModule.ssrModuleSource).not.toContain(
		's.disabled = props.disabled ?? false;',
	);
});

// Alternate shape: different family, state, property, component and attribute
// names, and the computed read is the whole widget-root attribute.
test('an alternate-shaped family lowers the same way', async () => {
	const compiled = await compile(
		'src/gate.tsrx',
		`
import { shared, state, computed } from '@markless/core';

export const gate = shared(() => {
	const cell = state({ open: false, locked: true });
	const isOpen = computed(() => cell.open !== false);

	return { ...cell, isOpen, flip() { cell.open = !cell.open; } };
}, { scope: 'widget' });

export function Panel(config) @{
	const cell = gate();
	cell.locked = config.locked ?? true;

	<section data-gate ui-open={cell.isOpen} ui-locked={cell.locked} />
}
`,
	);
	const template = compiled.renderData.chunks.find((chunk) => chunk.id === 'template:Panel');
	const openSlot = template?.slots.find(
		(candidate) => candidate.kind === 'attribute' && candidate.name === 'ui-open',
	);

	expect(openSlot && 'residue' in openSlot ? openSlot.residue : null).toEqual({
		kind: 'graph-read',
		graphNodeId: 'shared:src/gate.tsrx#gate/computed:isOpen',
		path: [],
	});
	expect(compiled.publicRenderModule.ssrModuleSource).toContain(
		'marklessSsrRenderStateValues.set("shared:src/gate.tsrx#gate/state:cell", ' +
			'{ ...marklessSsrRenderStateValues.get("shared:src/gate.tsrx#gate/state:cell"), ' +
			'["locked"]: (config.locked ?? true) });',
	);
});

test('a body seed the compiler cannot build fails the compile closed', async () => {
	const compiled = await compile(
		'src/bad-seed.tsrx',
		`
import { shared, state } from '@markless/core';

export const spike = shared(() => {
	const s = state({ label: '' });
	return { ...s };
}, { scope: 'widget' });

export function Root(props) @{
	const s = spike();
	s.label = window.location.href;

	<div data-root>{s.label}</div>
}
`,
	);

	expect(
		compiled.stateLowering.diagnostics.filter(
			(diagnostic) => diagnostic.severity === 'error',
		),
	).toEqual([expect.objectContaining({ code: 'MARKLESS_SHARED_SEED_UNSUPPORTED' })]);
});

test('a component-body seed of shared state overrides the factory initial for that render', async () => {
	const compiled = await compile('src/spike.tsrx', familySource);

	expect(compiled.publicRenderModule.ssrModuleSource).toContain(
		'marklessSsrRenderStateValues.set("shared:src/spike.tsrx#spike/state:s", ' +
			'{ ...marklessSsrRenderStateValues.get("shared:src/spike.tsrx#spike/state:s"), ' +
			'["disabled"]: (props.disabled ?? false) });',
	);
});

// D2: an inline `computed()` in the factory's returned object literal is the
// same graph node the named-const form declares, keyed by the property name.
const inlineComputedSource = `
import { shared, state, computed } from '@markless/core';

export const spike = shared(() => {
	const s = state({ checked: true });

	return {
		...s,
		isChecked: computed(() => s.checked === true),
		toggle() { s.checked = !s.checked; },
	};
}, { scope: 'widget' });

export function Box() @{
	const s = spike();

	<button type="button" data-box ui-checked={s.isChecked} onClick={() => s.toggle()}>x</button>
}
`;

test('an inline computed in the returned object literal becomes a graph node keyed by its property name', async () => {
	const compiled = await compile('src/spike.tsrx', inlineComputedSource);
	const binding = compiled.semanticGraph.graphBindings.find(
		(candidate) => candidate.id === 'shared:src/spike.tsrx#spike/computed:isChecked',
	);

	expect(binding).toMatchObject({ kind: 'computed', async: false, writable: false });
	expect(binding?.dependencies).toEqual([
		expect.objectContaining({ graphNodeId: 'shared:src/spike.tsrx#spike/state:s' }),
	]);
});

test('a template read of an inline factory computed resolves to that node', async () => {
	const compiled = await compile('src/spike.tsrx', inlineComputedSource);
	const template = compiled.renderData.chunks.find((chunk) => chunk.id === 'template:Box');
	const slot = template?.slots.find(
		(candidate) => candidate.kind === 'attribute' && candidate.name === 'ui-checked',
	);

	expect(slot && 'residue' in slot ? slot.residue : null).toEqual({
		kind: 'graph-read',
		graphNodeId: 'shared:src/spike.tsrx#spike/computed:isChecked',
		path: [],
	});
	expect(
		compiled.semanticGraph.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'),
	).toEqual([]);
});

// D1: CSR renders from the component definitions, so the body seed travels as a
// `symbol-function` initial value on the component that wrote it.
test('the component definition carries the body seed as a symbol-function initial value', async () => {
	const compiled = await compile('src/spike.tsrx', familySource);
	const root = compiled.publicRenderModule.componentDefinitions.find(
		(definition) => definition.name === 'Root',
	) as
		| {
				readonly initialValues: ReadonlyArray<{
					readonly graphNodeId: string;
					readonly value: { readonly kind: string; readonly symbolId?: string };
				}>;
		  }
		| undefined;
	const seed = root?.initialValues.find(
		(initial) =>
			initial.graphNodeId === 'shared:src/spike.tsrx#spike/state:s' &&
			initial.value.kind === 'symbol-function',
	);

	expect(seed).toBeDefined();
	const symbol = compiled.symbolResolver.symbols.find(
		(candidate) => candidate.id === seed?.value.symbolId,
	);
	expect(symbol).toMatchObject({
		kind: 'shared-seed',
		graphNodeId: 'shared:src/spike.tsrx#spike/state:s',
		path: ['disabled'],
		componentName: 'Root',
	});
});

test('the seed symbol module merges the assigned property over the factory initial', async () => {
	const compiled = await compile('src/spike.tsrx', familySource);
	const seedSymbol = compiled.symbolResolver.symbols.find(
		(candidate) => candidate.kind === 'shared-seed',
	);
	const module = compiled.symbolModules.modules.find(
		(candidate) => candidate.symbolId === seedSymbol?.id,
	);

	expect(module?.source).toContain('const props = context.graph.read("prop:props", []);');
	expect(module?.source).toContain(
		'return { ...context.graph.read("shared:src/spike.tsrx#spike/state:s", []), ' +
			'["disabled"]: (props.disabled ?? false) };',
	);
});

test('a sibling component of the same widget carries no seed of its own', async () => {
	const compiled = await compile('src/spike.tsrx', familySource);
	const box = compiled.publicRenderModule.componentDefinitions.find(
		(definition) => definition.name === 'Box',
	) as
		| { readonly initialValues: ReadonlyArray<{ readonly graphNodeId: string }> }
		| undefined;
	const seedSymbolIds = new Set(
		compiled.symbolResolver.symbols.flatMap((candidate) =>
			candidate.kind === 'shared-seed' ? [candidate.id] : [],
		),
	);

	expect(seedSymbolIds.size).toBe(1);
	expect(
		(box?.initialValues ?? []).some((initial) =>
			seedSymbolIds.has(
				(initial as { readonly value?: { readonly symbolId?: string } }).value?.symbolId ??
					'',
			),
		),
	).toBe(false);
});

// A widget's parts are projected into its root, so they render BEFORE the root
// body seeds. A part reading a seeded field would render the factory initial, so
// the compiler refuses the pair instead of dropping the mismatch silently.
test('a part reading a field the widget root seeds fails the compile closed', async () => {
	const compiled = await compile(
		'src/gate.tsrx',
		`
import { shared, state } from '@markless/core';

export const gate = shared(() => {
	const cell = state({ open: false, locked: true });
	return { ...cell, flip() { cell.open = !cell.open; } };
}, { scope: 'widget' });

export function Panel({ locked, children }) @{
	const cell = gate();
	cell.locked = locked ?? true;

	<section data-gate ui-locked={cell.locked}>{children}</section>
}

export function Handle() @{
	const cell = gate();

	<button type="button" data-handle ui-locked={cell.locked} onClick={() => cell.flip()}>h</button>
}
`,
	);

	expect(
		compiled.stateLowering.diagnostics.filter(
			(diagnostic) => diagnostic.severity === 'error',
		),
	).toEqual([
		expect.objectContaining({ code: 'MARKLESS_SHARED_SEED_PART_READ_UNSUPPORTED' }),
	]);
});

test('a part reading a field the root does NOT seed compiles', async () => {
	const compiled = await compile(
		'src/gate.tsrx',
		`
import { shared, state } from '@markless/core';

export const gate = shared(() => {
	const cell = state({ open: false, locked: true });
	return { ...cell, flip() { cell.open = !cell.open; } };
}, { scope: 'widget' });

export function Panel({ locked, children }) @{
	const cell = gate();
	cell.locked = locked ?? true;

	<section data-gate ui-locked={cell.locked}>{children}</section>
}

export function Handle() @{
	const cell = gate();

	<button type="button" data-handle ui-open={cell.open} onClick={() => cell.flip()}>h</button>
}
`,
	);

	expect(
		compiled.stateLowering.diagnostics.filter(
			(diagnostic) => diagnostic.severity === 'error',
		),
	).toEqual([]);
});
