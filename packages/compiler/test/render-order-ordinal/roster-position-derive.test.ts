import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';

/**
 * A part asking where it sits in its family's roster is the one derive-time
 * element() handle read the compiler answers instead of refusing.
 *
 * The question is answerable because the framework knows render order: at server
 * render the position is the order the widget instance emitted its parts, and
 * after resume it is the roster's live document order. Both sides are asked with
 * the same two node ids, so they cannot disagree.
 *
 * The runtime answers neither yet. This file pins the shape the compiler emits
 * for it, and the refusal every other derive-time handle read still gets.
 */

const CODE = 'MARKLESS_ELEMENT_HANDLE_UNBOUND';

const ROSTER_ID = 'shared:src/Ic.tsrx#ic/element:itemEls';
const MEMBER_ID = 'element:mine';

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

	<div data-ic-root>{children}</div>
}

export function IcItem({ children }) @{
	const w = ic();
	const mine = element<HTMLDivElement>();
	const pos = computed(() => w.itemEls.indexOf(mine as HTMLDivElement));

	<div data-ic-item el={[w.itemEls, mine]} ui-pos={pos}>{children}</div>
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

test('the roster position compiles with no refusal and one recognised record', async () => {
	const result = await compile('src/Ic.tsrx', ADMITTED);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.semanticGraph.elementRosterPositions).toEqual([
		{
			computedGraphNodeId: 'computed:pos',
			computedName: 'pos',
			componentName: 'IcItem',
			rosterGraphNodeId: ROSTER_ID,
			rosterSource: 'w.itemEls',
			handleGraphNodeId: MEMBER_ID,
			handleName: 'mine',
			hostNodeId: 'h1',
			source: 'w.itemEls.indexOf(mine as HTMLDivElement)',
			sourceSpan: { filename: 'src/Ic.tsrx', start: 464, end: 505 },
		},
	]);
});

/**
 * The lowered form, verbatim. Two ids and nothing else: the member handle
 * travels as an id because a derive body holds no DOM node to hand over, and the
 * answering side owns the lookup.
 */
test('the derive symbol lowers the whole body to one position query', async () => {
	const result = await compile('src/Ic.tsrx', ADMITTED);

	const derive = result.symbolModules.modules.find(
		(module) => module.kind === 'sync-computed-derive',
	);
	expect(derive?.source).toContain(
		`return context.rosterPosition("${ROSTER_ID}", "${MEMBER_ID}");`,
	);
	// The two handle reads are gone: a graph read of either would answer undefined.
	expect(derive?.source).not.toContain('context.graph.read');
	expect(derive?.source).toContain(
		'export const authoredSource = "() => w.itemEls.indexOf(mine as HTMLDivElement)";',
	);
});

/**
 * The dependency record is what a runtime invalidates on: the roster's own graph
 * binding, named in the shape `ProtocolStatePayload.computed[].dependencies`
 * already ships. No serializer field was added for it.
 *
 * The member handle is NOT a dependency. It never moves, and its id is already
 * inside the lowered call.
 */
test('the computed protocol record names the roster binding and only it', async () => {
	const result = await compile('src/Ic.tsrx', ADMITTED);

	const record = result.protocolState.computed.find(
		(computed) => computed.graphNodeId === 'computed:pos',
	);
	expect(record?.async).toBe(false);
	expect(record?.deriveSymbolId).toBe('symbol:3');
	expect(record?.dependencies).toEqual([{ graphNodeId: ROSTER_ID, path: [] }]);
});

/**
 * Server render asks the same question of the render context. It cannot answer
 * yet, and an unanswered position throws by name rather than standing in as a
 * number - every part would otherwise silently render position 0.
 */
test('the SSR module asks the render context for the same two ids', async () => {
	const result = await compile('src/Ic.tsrx', ADMITTED);

	expect(result.publicRenderModule.ssrModuleSource).toContain(
		`const pos = (marklessSsrRenderContext?.rosterPosition ?? (()=>{throw new Error("MARKLESS_SSR_ROSTER_POSITION_UNANSWERED: computed:pos");}))("${ROSTER_ID}", "${MEMBER_ID}");`,
	);
	// The handle reads never reach the SSR body as reads of a state value.
	expect(result.publicRenderModule.ssrModuleSource).not.toContain('w.itemEls.indexOf');
});

test('the rendered attribute still reads the computed node through its derive symbol', async () => {
	const result = await compile('src/Ic.tsrx', ADMITTED);

	expect(result.publicRenderModule.renderDataModuleSource).toContain(
		'{"graphNodeId":"computed:pos","value":{"kind":"symbol-function","symbolId":"symbol:3"}}',
	);
	expect(result.publicRenderModule.renderDataModuleSource).toContain(
		'"name":"ui-pos"',
	);
});

// ---------------------------------------------------------------------------
// Everything the widening does NOT admit. Each of these is still a refusal, and
// the reason is named per case, because "roster position" is one question and
// not a licence to read handles while deriving.

test('the roster read alone is still refused', async () => {
	const result = await compile(
		'src/RosterOnly.tsrx',
		ADMITTED.replace(
			'const pos = computed(() => w.itemEls.indexOf(mine as HTMLDivElement));',
			'const pos = computed(() => w.itemEls.length);',
		),
	);

	const [refusal, ...rest] = refusals(result);
	expect(rest).toEqual([]);
	expect(refusal?.message).toContain('"w.itemEls.length"');
	expect(result.semanticGraph.elementRosterPositions).toBeUndefined();
});

test('the position query plus anything else is refused, both reads', async () => {
	const result = await compile(
		'src/PlusOne.tsrx',
		ADMITTED.replace(
			'w.itemEls.indexOf(mine as HTMLDivElement)',
			'w.itemEls.indexOf(mine as HTMLDivElement) + 1',
		),
	);

	expect(refusals(result)).toHaveLength(2);
	expect(result.semanticGraph.elementRosterPositions).toBeUndefined();
});

/**
 * The proof that "mine" is a member of that roster is that both handles are
 * bound on ONE element. Split them across two elements and the derive is asking
 * about an element the roster may not hold.
 */
test('a member handle bound on a different element is refused', async () => {
	const result = await compile(
		'src/SplitBinding.tsrx',
		ADMITTED.replace(
			'<div data-ic-item el={[w.itemEls, mine]} ui-pos={pos}>{children}</div>',
			'<div data-ic-item el={w.itemEls} ui-pos={pos}><span el={mine}>{children}</span></div>',
		),
	);

	expect(refusals(result)).toHaveLength(2);
	expect(result.semanticGraph.elementRosterPositions).toBeUndefined();
});

/**
 * The ruling is about a family instance's roster. A part-local plural handle
 * collects only this part's own elements, so a position in it is not the
 * same-instance render order the ruling names.
 */
test('a part-local plural roster is refused', async () => {
	const result = await compile(
		'src/LocalRoster.tsrx',
		`
import { computed, element } from '@markless/core';

export default function Local({ children }) @{
	const all = element<HTMLDivElement[]>();
	const mine = element<HTMLDivElement>();
	const pos = computed(() => all.indexOf(mine as HTMLDivElement));

	<div el={[all, mine]} ui-pos={pos}>{children}</div>
}
`,
	);

	expect(refusals(result)).toHaveLength(2);
	expect(result.semanticGraph.elementRosterPositions).toBeUndefined();
});

test('a position query in a shared factory computed is refused', async () => {
	const result = await compile(
		'src/FactoryQuery.tsrx',
		`
import { computed, element, shared, state } from '@markless/core';

export const ic = shared(
	() => {
		const s = state({ tick: 0 });
		const itemEls = element<HTMLDivElement[]>();
		const mine = element<HTMLDivElement>();
		const pos = computed(() => itemEls.indexOf(mine as HTMLDivElement));
		return { ...s, itemEls, mine, pos };
	},
	{ scope: 'widget' },
);

export function IcItem({ children }) @{
	const w = ic();

	<div el={[w.itemEls, w.mine]} ui-pos={w.pos}>{children}</div>
}
`,
	);

	expect(refusals(result).length).toBeGreaterThan(0);
	expect(result.semanticGraph.elementRosterPositions).toBeUndefined();
});

/**
 * A module with no position query keeps the exact artifact key set it had before
 * this record existed. That is what holds emit byte-equality for every fixture
 * without the shape.
 */
test('a module without the shape carries no roster-position key', async () => {
	const result = await compile(
		'src/Plain.tsrx',
		`import { computed, state } from '@markless/core'; export default function App() @{ const count = state(2); const doubled = computed(() => count * 2); <output>{doubled}</output> }`,
	);

	expect('elementRosterPositions' in result.semanticGraph).toBe(false);
});
