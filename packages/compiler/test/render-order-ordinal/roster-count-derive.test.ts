import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';

/**
 * How many parts a family instance has is the second derive-time element()
 * handle read the compiler answers instead of refusing.
 *
 * It is the same question as the roster position - render order, which
 * the framework knows on both sides - so it is answerable for the same reason.
 * It needs no member handle and no proof of membership, so the root or any part
 * may ask. Families need it at render: otp's `maxlength` and `ui-max`, tour's
 * "2 of 5" and the forward trigger's gate all read a count while rendering, and
 * seeding one from a derived position is MARKLESS_SHARED_SEED_UNSUPPORTED.
 *
 * The runtime answers the lowered call on neither side yet. This file pins the
 * shape the compiler emits for it, and the refusal every other derive-time
 * handle read still gets.
 */

const CODE = 'MARKLESS_ELEMENT_HANDLE_UNBOUND';

const ROSTER_ID = 'shared:src/Ic.tsrx#ic/element:itemEls';

const ADMITTED = `
import { computed, element, shared, state } from '@markless/core';

export const ic = shared(
	() => {
		const s = state({ tick: 0 });
		const itemEls = element<HTMLDivElement[]>();
		return { ...s, itemEls };
	},
	{ scope: 'widget' },
);

export function IcRoot({ children }) @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<div data-ic-root ui-max={total}>{children}</div>
}

export function IcItem({ children }) @{
	const w = ic();
	const mine = element<HTMLDivElement>();
	const of = computed(() => w.itemEls.length);

	<div data-ic-item el={[w.itemEls, mine]} ui-of={of}>{children}</div>
}
`;

async function compile(filename: string, source: string) {
	return compileTsrxModule({ filename, source, symbols: [] });
}

function refusals(result: Awaited<ReturnType<typeof compile>>) {
	return result.semanticGraph.diagnostics.filter(
		(diagnostic) => diagnostic.code === CODE && diagnostic.severity === 'error',
	);
}

/**
 * Both askers are pinned in one fixture on purpose: the root binds none of the
 * roster's elements and the item binds one, and neither fact changes the answer.
 * A count is about the instance, not about the asker's place in it.
 */
test('the root and a part both ask the count, with no refusal and one record each', async () => {
	const result = await compile('src/Ic.tsrx', ADMITTED);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.semanticGraph.elementRosterCounts).toEqual([
		{
			computedGraphNodeId: 'computed:total',
			computedName: 'total',
			componentName: 'IcRoot',
			rosterGraphNodeId: ROSTER_ID,
			rosterSource: 'w.itemEls',
			source: 'w.itemEls.length',
			sourceSpan: { filename: 'src/Ic.tsrx', start: 328, end: 344 },
		},
		{
			computedGraphNodeId: 'computed:of',
			computedName: 'of',
			componentName: 'IcItem',
			rosterGraphNodeId: ROSTER_ID,
			rosterSource: 'w.itemEls',
			source: 'w.itemEls.length',
			sourceSpan: { filename: 'src/Ic.tsrx', start: 527, end: 543 },
		},
	]);
});

/**
 * The lowered form, verbatim. One id: the roster is the whole question, and the
 * answering side owns the counting.
 */
test('the derive symbol lowers the whole body to one count query', async () => {
	const result = await compile('src/Ic.tsrx', ADMITTED);

	const derives = result.symbolModules.modules.filter(
		(module) => module.kind === 'sync-computed-derive',
	);
	expect(derives).toHaveLength(2);
	for (const derive of derives) {
		expect(derive.source).toContain(`return context.rosterCount("${ROSTER_ID}");`);
		// A graph read of the handle would answer undefined, and `.length` of it would throw.
		expect(derive.source).not.toContain('context.graph.read');
	}
	expect(derives[0]?.source).toContain(
		'export const authoredSource = "() => w.itemEls.length";',
	);
});

/**
 * The dependency record is what a runtime invalidates on: the roster's own graph
 * binding, named in the shape `ProtocolStatePayload.computed[].dependencies`
 * already ships, exactly as the position record does. No serializer field was
 * added for it.
 *
 * `length` is NOT a path segment on that dependency. The lowered call answers
 * the count; the path would ask a runtime to read `.length` off a graph value
 * that holds no array.
 */
test('the computed protocol record names the roster binding with an empty path', async () => {
	const result = await compile('src/Ic.tsrx', ADMITTED);

	const record = result.protocolState.computed.find(
		(computed) => computed.graphNodeId === 'computed:total',
	);
	expect(record?.async).toBe(false);
	expect(record?.deriveSymbolId).toBe('symbol:4');
	expect(record?.dependencies).toEqual([{ graphNodeId: ROSTER_ID, path: [] }]);
});

/**
 * Server render asks the same question of the render context. It cannot answer
 * yet, and an unanswered count throws by name rather than standing in as a
 * number - every family would otherwise silently render a count of zero.
 */
test('the SSR module asks the render context for the roster id', async () => {
	const result = await compile('src/Ic.tsrx', ADMITTED);

	expect(result.publicRenderModule.ssrModuleSource).toContain(
		`const total = (marklessSsrRenderContext?.rosterCount ?? (()=>{throw new Error("MARKLESS_SSR_ROSTER_COUNT_UNANSWERED: computed:total");}))("${ROSTER_ID}");`,
	);
	expect(result.publicRenderModule.ssrModuleSource).toContain(
		`const of = (marklessSsrRenderContext?.rosterCount ?? (()=>{throw new Error("MARKLESS_SSR_ROSTER_COUNT_UNANSWERED: computed:of");}))("${ROSTER_ID}");`,
	);
	// The handle read never reaches the SSR body as a read of a state value.
	expect(result.publicRenderModule.ssrModuleSource).not.toContain('w.itemEls.length');
});

test('the rendered attribute still reads the computed node through its derive symbol', async () => {
	const result = await compile('src/Ic.tsrx', ADMITTED);

	expect(result.publicRenderModule.renderDataModuleSource).toContain(
		'{"graphNodeId":"computed:total","value":{"kind":"symbol-function","symbolId":"symbol:4"}}',
	);
	expect(result.publicRenderModule.renderDataModuleSource).toContain('"name":"ui-max"');
});

// ---------------------------------------------------------------------------
// Everything the widening does NOT admit. "How many are there" is one question,
// not a licence to read handles while deriving.

test('any other property of the roster is still refused', async () => {
	const result = await compile(
		'src/OtherProperty.tsrx',
		ADMITTED.replace('const total = computed(() => w.itemEls.length);', 'const total = computed(() => w.itemEls.at(0));'),
	);

	expect(refusals(result).map((refusal) => refusal.message)).toEqual([
		expect.stringContaining('"w.itemEls"'),
	]);
	expect(countRecordsFor(result, 'computed:total')).toEqual([]);
});

test('an indexed read of the roster is still refused', async () => {
	const result = await compile(
		'src/Indexed.tsrx',
		ADMITTED.replace('const total = computed(() => w.itemEls.length);', 'const total = computed(() => w.itemEls[0]);'),
	);

	expect(refusals(result).length).toBeGreaterThan(0);
	expect(countRecordsFor(result, 'computed:total')).toEqual([]);
});

test('the count query plus anything else is refused', async () => {
	const result = await compile(
		'src/PlusOne.tsrx',
		ADMITTED.replace('const total = computed(() => w.itemEls.length);', 'const total = computed(() => w.itemEls.length + 1);'),
	);

	expect(refusals(result).map((refusal) => refusal.message)).toEqual([
		expect.stringContaining('"w.itemEls.length"'),
	]);
	expect(countRecordsFor(result, 'computed:total')).toEqual([]);
});

/**
 * The ruling is about a family instance's roster. A part-local plural handle
 * collects only this part's own elements, so its size is not the instance's
 * part count.
 */
test('a part-local plural roster is refused', async () => {
	const result = await compile(
		'src/LocalRoster.tsrx',
		`
import { computed, element } from '@markless/core';

export default function Local({ children }) @{
	const all = element<HTMLDivElement[]>();
	const total = computed(() => all.length);

	<div el={all} ui-max={total}>{children}</div>
}
`,
	);

	expect(refusals(result)).toHaveLength(1);
	expect(result.semanticGraph.elementRosterCounts).toBeUndefined();
});

/**
 * A shared() factory computed is one node per instance, not a component render,
 * so there is no component body for the SSR half to lower the count into. The
 * count belongs to whichever part renders it.
 */
test('a count query in a shared factory computed is refused', async () => {
	const result = await compile(
		'src/FactoryQuery.tsrx',
		`
import { computed, element, shared, state } from '@markless/core';

export const ic = shared(
	() => {
		const s = state({ tick: 0 });
		const itemEls = element<HTMLDivElement[]>();
		const total = computed(() => itemEls.length);
		return { ...s, itemEls, total };
	},
	{ scope: 'widget' },
);

export function IcRoot({ children }) @{
	const w = ic();

	<div data-ic-root ui-max={w.total}>{children}</div>
}
`,
	);

	expect(refusals(result).length).toBeGreaterThan(0);
	expect(result.semanticGraph.elementRosterCounts).toBeUndefined();
});

// ---------------------------------------------------------------------------
// Outside a computed(). The admission is scoped to the one node kind whose
// derive both regimes lower; nothing else picks up a lowered call.

test('an async computed asking the count is still refused', async () => {
	const result = await compile(
		'src/AsyncCount.tsrx',
		ADMITTED.replace('const total = computed(() => w.itemEls.length);', 'const total = computed(async () => w.itemEls.length);'),
	);

	expect(refusals(result).map((refusal) => refusal.message)).toEqual([
		expect.stringContaining('"w.itemEls.length"'),
	]);
	expect(countRecordsFor(result, 'computed:total')).toEqual([]);
});

/**
 * A plain local const and a markup interpolation are not derive nodes: no
 * computed binding exists to carry a record, and nothing asks the runtime for a
 * count. They compile as they did before this widening.
 */
test('roster.length outside a computed mints no record and lowers no call', async () => {
	const roots = {
		'src/LocalConst.tsrx': `	const w = ic();
	const total = w.itemEls.length;

	<div data-ic-root ui-max={total}>{children}</div>`,
		'src/MarkupRead.tsrx': `	const w = ic();

	<div data-ic-root ui-max={w.itemEls.length}>{children}</div>`,
	};

	for (const [filename, root] of Object.entries(roots)) {
		const result = await compile(
			filename,
			`
import { computed, element, shared, state } from '@markless/core';

export const ic = shared(
	() => {
		const s = state({ tick: 0 });
		const itemEls = element<HTMLDivElement[]>();
		return { ...s, itemEls };
	},
	{ scope: 'widget' },
);

export function IcRoot({ children }) @{
${root}
}
`,
		);

		expect(result.semanticGraph.elementRosterCounts).toBeUndefined();
		expect(result.publicRenderModule.ssrModuleSource).not.toContain('rosterCount');
		for (const module of result.symbolModules.modules) {
			expect(module.source).not.toContain('context.rosterCount');
		}
	}
});

/**
 * A module with no count query keeps the exact artifact key set it had before
 * this record existed. That is what holds emit byte-equality for every fixture
 * without the shape.
 */
test('a module without the shape carries no roster-count key', async () => {
	const result = await compile(
		'src/Plain.tsrx',
		`import { computed, state } from '@markless/core'; export default function App() @{ const count = state(2); const doubled = computed(() => count * 2); <output>{doubled}</output> }`,
	);

	expect('elementRosterCounts' in result.semanticGraph).toBe(false);
});

function countRecordsFor(
	result: Awaited<ReturnType<typeof compile>>,
	computedGraphNodeId: string,
) {
	return (result.semanticGraph.elementRosterCounts ?? []).filter(
		(record) => record.computedGraphNodeId === computedGraphNodeId,
	);
}
