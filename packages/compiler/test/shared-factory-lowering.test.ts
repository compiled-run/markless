import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// The shared-factory lowering seam: what a widget family may write inside its
// factory and read back from its parts. Every case here reproduced as a render
// or click failure before the lowering existed.

async function compile(filename: string, source: string) {
	return compileTsrxModule({
		filename,
		source,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
}

function errors(compiled: Awaited<ReturnType<typeof compile>>) {
	return [...compiled.semanticGraph.diagnostics, ...compiled.stateLowering.diagnostics].filter(
		(diagnostic) => diagnostic.severity === 'error',
	);
}

// B3 — a type assertion in the factory's state() initializer.
const castSource = `
import { shared, state } from '@markless/core';

export const spike = shared(() => {
	const s = state({ checked: false as boolean | 'mixed', name: '' as string });
	return { ...s, toggle() { s.checked = true; } };
}, { scope: 'widget' });

export function Box() @{
	const s = spike();

	<button type="button" data-box ui-checked={s.checked} onClick={() => s.toggle()}>x</button>
}
`;

test('an as-cast in a factory state initializer still yields a known initial value', async () => {
	const compiled = await compile('src/spike.tsrx', castSource);
	const binding = compiled.semanticGraph.graphBindings.find(
		(candidate) => candidate.id === 'shared:src/spike.tsrx#spike/state:s',
	);

	expect(binding).toMatchObject({
		initialValue: { checked: false, name: '' },
		initialValueKnown: true,
	});
});

test('a part reading a cast-initialised factory field resolves to the shared node', async () => {
	const compiled = await compile('src/spike.tsrx', castSource);
	const template = compiled.renderData.chunks.find((chunk) => chunk.id === 'template:Box');
	const slot = template?.slots.find(
		(candidate) => candidate.kind === 'attribute' && candidate.name === 'ui-checked',
	);

	expect(slot && 'residue' in slot ? slot.residue : null).toEqual({
		kind: 'graph-read',
		graphNodeId: 'shared:src/spike.tsrx#spike/state:s',
		path: ['checked'],
	});
	expect(errors(compiled)).toEqual([]);
});

// Alternate shape: a satisfies-cast and a non-null assertion on a different
// family, state name, and property names.
test('an alternate-shaped assertion in a factory initializer lowers the same way', async () => {
	const compiled = await compile(
		'src/gate.tsrx',
		`
import { shared, state } from '@markless/core';

export const gate = shared(() => {
	const cell = state({ open: (false satisfies boolean), tone: 'calm' as 'calm' | 'loud' });
	return { ...cell, flip() { cell.open = true; } };
}, { scope: 'widget' });

export function Panel() @{
	const cell = gate();

	<section data-gate ui-open={cell.open} data-tone={cell.tone} />
}
`,
	);
	const binding = compiled.semanticGraph.graphBindings.find(
		(candidate) => candidate.id === 'shared:src/gate.tsrx#gate/state:cell',
	);

	expect(binding).toMatchObject({
		initialValue: { open: false, tone: 'calm' },
		initialValueKnown: true,
	});
});

// B2 — a local const (or any second statement) inside a factory method.
const methodLocalSource = `
import { shared, state } from '@markless/core';

export const spike = shared(() => {
	const s = state({ checked: false, changes: 0 });
	return {
		...s,
		toggle() {
			const next = s.checked !== true;
			s.checked = next;
			s.changes = s.changes + 1;
		},
	};
}, { scope: 'widget' });

export function Box() @{
	const s = spike();

	<button type="button" data-box ui-checked={s.checked} onClick={() => s.toggle()}>x</button>
}
`;

test('a factory method local reads the shared cell through the graph, not a factory local', async () => {
	const compiled = await compile('src/spike.tsrx', methodLocalSource);
	const handler = compiled.symbolResolver.symbols.find(
		(candidate) => candidate.kind === 'event-handler',
	);
	const module = compiled.symbolModules.modules.find(
		(candidate) => candidate.symbolId === handler?.id,
	);

	expect(module?.source).toContain(
		'const next = context.graph.read("shared:src/spike.tsrx#spike/state:s", ["checked"]) !== true;',
	);
	// No bare factory local survives into the browser module.
	expect(module?.source).not.toMatch(/(^|[^."\w])s\.checked/);
	expect(errors(compiled)).toEqual([]);
});

test('a second statement in the same factory method also lowers its reads', async () => {
	const compiled = await compile('src/spike.tsrx', methodLocalSource);
	const handler = compiled.symbolResolver.symbols.find(
		(candidate) => candidate.kind === 'event-handler',
	);
	const module = compiled.symbolModules.modules.find(
		(candidate) => candidate.symbolId === handler?.id,
	);

	expect(module?.source).toContain(
		'value: context.graph.read("shared:src/spike.tsrx#spike/state:s", ["changes"]) + 1',
	);
});

// Alternate shape: a method whose local feeds a callback the factory holds.
test('an alternate-shaped factory method lowers its locals the same way', async () => {
	const compiled = await compile(
		'src/gate.tsrx',
		`
import { shared, state } from '@markless/core';

export const gate = shared(() => {
	const cell = state({ open: false });
	return {
		...cell,
		flip() {
			const wanted = !cell.open;
			cell.open = wanted;
		},
	};
}, { scope: 'widget' });

export function Panel() @{
	const cell = gate();

	<button type="button" data-gate onClick={() => cell.flip()}>g</button>
}
`,
	);
	const handler = compiled.symbolResolver.symbols.find(
		(candidate) => candidate.kind === 'event-handler',
	);
	const module = compiled.symbolModules.modules.find(
		(candidate) => candidate.symbolId === handler?.id,
	);

	expect(module?.source).toContain(
		'const wanted = !context.graph.read("shared:src/gate.tsrx#gate/state:cell", ["open"]);',
	);
});

// B1 — a composite template expression over a shared read.
const compositeSource = `
import { shared, state } from '@markless/core';

export const spike = shared(() => {
	const s = state({ checked: false, disabled: false });
	return { ...s, toggle() { s.checked = true; } };
}, { scope: 'widget' });

export function Box({ disabled }) @{
	const s = spike();
	s.disabled = disabled ?? false;

	<button
		type="button"
		data-box
		ui-checked={s.checked === true}
		aria-checked={s.checked === 'mixed' ? 'mixed' : 'false'}
		disabled={disabled || s.disabled}
	>{s.checked === true ? 'on' : 'off'}</button>
}
`;

test('a composite over a shared read binds the instance in the client residue reader', async () => {
	const compiled = await compile('src/spike.tsrx', compositeSource);
	const clientSource = compiled.publicRenderModule.renderDataModuleSource ?? '';

	expect(clientSource).toContain(
		'"shared:src/spike.tsrx#spike/state:s"',
	);
	expect(errors(compiled)).toEqual([]);
});

test('a composite over a shared read reads the graph in the SSR module', async () => {
	const compiled = await compile('src/spike.tsrx', compositeSource);

	// Each recombined expression stands behind its own synthetic computed, whose
	// SSR derive binds the instance from the factory's graph node: the authored
	// expression evaluates without the factory's local, which does not exist here.
	expect(compiled.publicRenderModule.ssrModuleSource).toContain(
		'const s=read("shared:src/spike.tsrx#spike/state:s",[])',
	);
	expect(compiled.publicRenderModule.ssrModuleSource).toMatch(
		/marklessSsrRenderStateValues\.set\("computed:templateExpression:\d+"/,
	);
});

// B4 (first half) — an element() handle declared in the factory and returned on
// the instance is a handle, not a state read, when a part binds it with el=.
const factoryHandleSource = `
import { shared, state, element } from '@markless/core';

export const spike = shared(() => {
	const s = state({ checked: false });
	const triggerEl = element();
	return { ...s, triggerEl, toggle() { s.checked = true; } };
}, { scope: 'widget' });

export function Trigger() @{
	const s = spike();

	<button type="button" data-trigger el={s.triggerEl} onClick={() => s.toggle()}>x</button>
}
`;

test('el= through a shared instance binds the factory element node', async () => {
	const compiled = await compile('src/spike.tsrx', factoryHandleSource);

	expect(compiled.payloadArena.view.elementHandles).toEqual([
		{
			hostNodeId: expect.any(String),
			handleId: 'shared:src/spike.tsrx#spike/element:triggerEl',
			name: 'triggerEl',
		},
	]);
	expect(errors(compiled)).toEqual([]);
});

// Alternate shape: a different family, handle name, and host tag.
test('an alternate-shaped factory handle binds the same way', async () => {
	const compiled = await compile(
		'src/gate.tsrx',
		`
import { shared, state, element } from '@markless/core';

export const gate = shared(() => {
	const cell = state({ open: false });
	const panelEl = element();
	return { ...cell, panelEl, flip() { cell.open = true; } };
}, { scope: 'widget' });

export function Panel() @{
	const cell = gate();

	<section data-panel el={cell.panelEl} />
}
`,
	);

	expect(compiled.payloadArena.view.elementHandles).toEqual([
		{
			hostNodeId: expect.any(String),
			handleId: 'shared:src/gate.tsrx#gate/element:panelEl',
			name: 'panelEl',
		},
	]);
	expect(errors(compiled)).toEqual([]);
});

// B5 (owner ruling, 2026-08-20) — an assignment always assigns. A part with no
// destructuring default writes whatever the expression evaluated to, undefined
// included, exactly as the same statement would in plain JavaScript.
const omittedSeedSource = `
import { shared, state } from '@markless/core';

export const spike = shared(() => {
	const s = state({ checked: true });
	return { ...s, toggle() { s.checked = false; } };
}, { scope: 'widget' });

export function Root({ checked, children }) @{
	const s = spike();
	s.checked = checked;

	<div data-root ui-checked={s.checked}>{children}</div>
}
`;

// The same family, authored the ruled way: the default lives at the part
// signature, so an omitted prop seeds the default instead of undefined.
const defaultedSeedSource = omittedSeedSource.replace(
	'Root({ checked, children })',
	"Root({ checked = false, children })",
);

test('a seed with no destructuring default writes unconditionally during SSR', async () => {
	const compiled = await compile('src/spike.tsrx', omittedSeedSource);

	expect(compiled.publicRenderModule.ssrModuleSource).toContain(
		'{ const marklessSharedSeed = (checked); ' +
			'marklessStateValue(marklessSsrRenderStateValues, marklessSsrPayloadState, ' +
			'"shared:src/spike.tsrx#spike/state:s", ' +
			'{ ...marklessSsrRenderStateValues.get("shared:src/spike.tsrx#spike/state:s"), ' +
			'["checked"]: marklessSharedSeed }); }',
	);
	expect(errors(compiled)).toEqual([]);
});

// U-L: browser resume never re-runs a component body, so a seed that only
// reached this render's value map left the served payload holding the factory
// initial and the widget resumed from a value the server never rendered.
test('an SSR seed writes the served payload, not just this render values', async () => {
	const compiled = await compile('src/spike.tsrx', defaultedSeedSource);
	const source = compiled.publicRenderModule.ssrModuleSource ?? '';
	const seedWrite = source.slice(source.lastIndexOf('const marklessSharedSeed'));

	// The payload draft is the second argument, so the cell the page serves
	// carries the seeded value.
	expect(seedWrite).toContain(
		'marklessStateValue(marklessSsrRenderStateValues, marklessSsrPayloadState, ' +
			'"shared:src/spike.tsrx#spike/state:s",',
	);
	// The draft is cloned before the seed writes it and composed after, so the
	// served payload is the one carrying the seed.
	expect(source.indexOf('const marklessSsrPayloadState =')).toBeLessThan(
		source.lastIndexOf('const marklessSharedSeed'),
	);
	expect(source.lastIndexOf('const marklessSharedSeed')).toBeLessThan(
		source.indexOf('marklessSsrComposeState(marklessSsrPayloadState'),
	);
	expect(errors(compiled)).toEqual([]);
});

test('the CSR seed symbol writes the evaluated value with no undefined guard', async () => {
	const compiled = await compile('src/spike.tsrx', omittedSeedSource);
	const seed = compiled.symbolResolver.symbols.find(
		(candidate) => candidate.kind === 'shared-seed',
	);
	const module = compiled.symbolModules.modules.find(
		(candidate) => candidate.symbolId === seed?.id,
	);

	expect(module?.source).not.toContain('undefined');
	expect(module?.source).toContain(
		'return { ...context.graph.read("shared:src/spike.tsrx#spike/state:s", []), ' +
			'"checked": marklessSharedSeed };',
	);
	expect(errors(compiled)).toEqual([]);
});

test('a destructuring default reaches the SSR body local the seed reads', async () => {
	const compiled = await compile('src/spike.tsrx', defaultedSeedSource);

	expect(compiled.publicRenderModule.ssrModuleSource).toContain(
		'const { checked = false, children } = props ?? {};',
	);
	expect(errors(compiled)).toEqual([]);
});

test('the CSR seed symbol applies the destructuring default to the prop it reads', async () => {
	const compiled = await compile('src/spike.tsrx', defaultedSeedSource);
	const seed = compiled.symbolResolver.symbols.find(
		(candidate) => candidate.kind === 'shared-seed',
	);
	const module = compiled.symbolModules.modules.find(
		(candidate) => candidate.symbolId === seed?.id,
	);

	// `=== undefined` here is the destructuring default's own rule, not a skipped
	// write: an explicit `checked={undefined}` takes the default too.
	expect(module?.source).toContain(
		'const marklessProp_checked = context.graph.read("prop:props", ["checked"]);',
	);
	expect(module?.source).toContain(
		'const checked = marklessProp_checked === undefined ? false : marklessProp_checked;',
	);
	expect(errors(compiled)).toEqual([]);
});

test('the projected-child seed pass writes the seed unconditionally too', async () => {
	const compiled = await compile('src/spike.tsrx', defaultedSeedSource);
	const seedPass = (compiled.publicRenderModule.ssrModuleSource ?? '').split(
		'marklessSharedSeeds',
	)[2];

	expect(seedPass).toContain(
		'{ const marklessSharedSeed = (checked); marklessSsrSeeds.set(',
	);
});

test('a defaulted prop read outside a body assignment fails closed', async () => {
	const compiled = await compile(
		'src/spike.tsrx',
		`
import { shared, state } from '@markless/core';

export const spike = shared(() => {
	const s = state({ checked: true });
	return { ...s, toggle() { s.checked = false; } };
}, { scope: 'widget' });

export function Root({ checked = false, children }) @{
	const s = spike();
	s.checked = checked;

	<div data-root ui-checked={s.checked} data-raw={checked}>{children}</div>
}
`,
	);

	expect(
		compiled.stateLowering.diagnostics.filter(
			(diagnostic) => diagnostic.severity === 'error',
		),
	).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_STATE_DESTRUCTURE_DEFAULT_UNSUPPORTED',
			severity: 'error',
			phase: 'state-lowering',
		}),
	]);
});

// B6 (owner ruling) — a family shape that is page-scoped only by omission.
test('a multi-component family with no declared scope warns and names both fixes', async () => {
	const compiled = await compile(
		'src/spike.tsrx',
		`
import { shared, state } from '@markless/core';

export const spike = shared(() => {
	const s = state({ checked: false });
	return { ...s, toggle() { s.checked = true; } };
});

export function Root({ children }) @{
	const s = spike();

	<div data-root ui-checked={s.checked}>{children}</div>
}

export function Trigger() @{
	const s = spike();

	<button type="button" data-trigger onClick={() => s.toggle()}>t</button>
}
`,
	);
	const warning = compiled.semanticGraph.diagnostics.find(
		(diagnostic) => diagnostic.code === 'MARKLESS_SHARED_FAMILY_SCOPE_IMPLICIT',
	);

	expect(warning?.severity).toBe('warning');
	expect(warning?.message).toContain('spike');
	expect(warning?.message).toContain('Root');
	expect(warning?.message).toContain('Trigger');
	expect(JSON.stringify(warning)).toContain("{ scope: 'widget' }");
	expect(JSON.stringify(warning)).toContain("{ scope: 'page' }");
	expect(errors(compiled)).toEqual([]);
});

test('an explicit page scope on the same family shape silences the warning', async () => {
	const compiled = await compile(
		'src/spike.tsrx',
		`
import { shared, state } from '@markless/core';

export const spike = shared(() => {
	const s = state({ checked: false });
	return { ...s, toggle() { s.checked = true; } };
}, { scope: 'page' });

export function Root({ children }) @{
	const s = spike();

	<div data-root ui-checked={s.checked}>{children}</div>
}

export function Trigger() @{
	const s = spike();

	<button type="button" data-trigger onClick={() => s.toggle()}>t</button>
}
`,
	);

	expect(
		compiled.semanticGraph.diagnostics.filter(
			(diagnostic) => diagnostic.code === 'MARKLESS_SHARED_FAMILY_SCOPE_IMPLICIT',
		),
	).toEqual([]);
});

test('a single-component shared() with no declared scope does not warn', async () => {
	const compiled = await compile(
		'src/solo.tsrx',
		`
import { shared, state } from '@markless/core';

export const cart = shared(() => {
	const items = state({ count: 0 });
	return { ...items, add() { items.count = items.count + 1; } };
});

export default function Cart() @{
	const items = cart();

	<button type="button" data-cart onClick={() => items.add()}>{items.count}</button>
}
`,
	);

	expect(
		compiled.semanticGraph.diagnostics.filter(
			(diagnostic) => diagnostic.code === 'MARKLESS_SHARED_FAMILY_SCOPE_IMPLICIT',
		),
	).toEqual([]);
});

// Alternate shape for the same structural rule: the family is authored with the
// part above the root, different names, different field. The seeded cell has to
// follow the SEEDING component, not the first one in the file, or the payload
// write would silently no-op and resume would fall back to the placeholder.
const partFirstSeedSource = `
import { shared, state } from '@markless/core';

export const gate = shared(() => {
	const cell = state({ locked: false });
	return { ...cell, release() { cell.locked = false; } };
}, { scope: 'widget' });

export function Latch() @{
	const cell = gate();

	<button type="button" data-latch onClick={() => cell.release()}>x</button>
}

export function Panel({ locked = false, children }) @{
	const cell = gate();
	cell.locked = locked;

	<div data-panel ui-locked={cell.locked}>{children}</div>
}
`;

test('a widget-scoped cell is owned by the component that seeds it, not the first one', async () => {
	const compiled = await compile('src/gate.tsrx', partFirstSeedSource);
	const source = compiled.publicRenderModule.ssrModuleSource ?? '';
	const seeding = source.slice(source.indexOf('async function marklessRenderSsrPanel'));
	const part = source.slice(
		source.indexOf('async function marklessRenderSsr('),
	);

	expect(seeding).toContain(
		'marklessSelectStateNodes(marklessCloneState(payloadState), [0], [])',
	);
	expect(part).toContain('marklessSelectStateNodes(marklessCloneState(payloadState), [], [])');
	expect(seeding).toContain(
		'marklessStateValue(marklessSsrRenderStateValues, marklessSsrPayloadState, ' +
			'"shared:src/gate.tsrx#gate/state:cell",',
	);
	expect(errors(compiled)).toEqual([]);
});
