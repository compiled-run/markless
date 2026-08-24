import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { MARKLESS_WIDGET_INSTANCE_KEY } from '../src/passes/public-render/residue-reader.ts';

// Defect 65: a part that BINDS a shared element() handle, nested inside the part
// that READS it as an IDREF, minted an id the reference did not spell.
//
// The minted id is `'mx-' + widgetInstanceToken + handleGraphNodeId`. Both sides
// read the same handle node — `semantic-idref-handles.test.ts` pins that — so the
// only thing that could differ was the token, and it did: EVERY projecting child
// with seeds of its own registered a token naming its own edge. A widget ROOT
// should: it starts an instance. A PART must not: the parts written inside it
// belong to the instance it was placed in, and the reader, which the root edge
// restores to the enclosing token, then spells a different string than the
// element its projection rendered.
//
// The fix registers the token only for a child that ROOTS a widget. Which
// families a child roots is answered where that child was compiled, so a child
// this module cannot prove roots one asks the same `.marklessWidgetRoots` marker
// the nested-root boundary check reads.

async function compile(source: string) {
	return compileTsrxModule({
		filename: 'src/spike.tsrx',
		source,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
}

function seedChildSource(compiled: Awaited<ReturnType<typeof compile>>) {
	const source = compiled.publicRenderModule.ssrModuleSource ?? '';
	const start = source.indexOf('seedChild:');
	if (start === -1) return '';
	return source.slice(start, source.indexOf('renderChild:', start));
}

/**
 * Every widget-instance registration the emitted seed pass carries: the edge
 * whose case holds it, the instance path it would write, and whether it is
 * guarded on that child actually rooting a widget.
 */
function instanceRegistrations(
	seedChild: string,
): Array<{ edgeId: string; instancePath: string; guarded: boolean }> {
	const key = JSON.stringify(MARKLESS_WIDGET_INSTANCE_KEY);
	const pattern = new RegExp(
		`case "(component-edge:\\d+)":\\{(if\\(marklessSsrWidgetRoots\\([^)]*\\)\\.length\\))?marklessSsrSeeds\\.set\\(${key},marklessSsrIdPrefix\\+([^+]*)\\+`,
		'g',
	);
	return [...seedChild.matchAll(pattern)].map((match) => ({
		edgeId: match[1]!,
		instancePath: match[3]!,
		guarded: match[2] !== undefined,
	}));
}

/** The components this module stamped as widget roots, in emission order. */
function widgetRootMarkers(compiled: Awaited<ReturnType<typeof compile>>): string[] {
	const source = compiled.publicRenderModule.ssrModuleSource ?? '';
	return [...source.matchAll(/(\w+)\.marklessWidgetRoots = /g)].map((match) => match[1]!);
}

/** The slots whose value is a minted element() id, attribute name and handle. */
function idSlots(compiled: Awaited<ReturnType<typeof compile>>) {
	return compiled.semanticGraph.markup.chunks.flatMap((chunk) =>
		chunk.slots.flatMap((slot) =>
			slot.kind === 'attribute' && slot.residue.kind === 'element-handle-id'
				? [[slot.name, slot.residue.handleGraphNodeId]]
				: [],
		),
	);
}

// One family, six shapes. `Root` seeds, so `Root` roots the family; every other
// component is a part of the widget a rendered `Root` starts.
const family = `
import { element, shared, state } from '@markless/core';

export const modal = shared(() => {
	const s = state({ open: false, labelled: false, described: false });
	const titleEl = element<HTMLHeadingElement>();
	return { ...s, titleEl };
}, { scope: 'widget' });

export function Root({ open = false, children }) @{
	const m = modal();
	m.open = open;

	<div data-root data-open={m.open}>{children}</div>
}

export function Trigger() @{
	const m = modal();

	<button type="button" data-trigger>open</button>
}

export function Content({ children }) @{
	const m = modal();
	m.labelled = true;

	<div role="dialog" aria-labelledby={m.titleEl}>{children}</div>
}

export function Title({ children }) @{
	const m = modal();
	m.described = true;

	<h2 el={m.titleEl}>{children}</h2>
}
`;

// The modal shape: the binder (`Title`) sits INSIDE the reader (`Content`).
const binderInsideReader = `${family}
export function Page() @{
	<section>
		<Root open={true}>
			<Trigger />
			<Content>
				<Title>Terms</Title>
			</Content>
		</Root>
	</section>
}
`;

// The collapsible shape: binder and reader are siblings at one projection depth.
const equalDepth = `${family}
export function Page() @{
	<section>
		<Root open={true}>
			<Title>Terms</Title>
			<Content>body</Content>
		</Root>
	</section>
}
`;

// The mirror: the reader sits inside the binder.
const readerInsideBinder = `${family}
export function Page() @{
	<section>
		<Root open={true}>
			<Title>
				<Content>body</Content>
			</Title>
		</Root>
	</section>
}
`;

// Cross-depth with the nesting held by an arm: which arm renders is a
// render-time answer, but which widget the parts belong to is not.
const insideArm = `${family}
export function Page({ show = true }) @{
	<section>
		<Root open={true}>
			@if (show) {
				<Content>
					<Title>Terms</Title>
				</Content>
			}
		</Root>
	</section>
}
`;

test('the element and the reference read one handle, whatever the nesting', async () => {
	for (const source of [binderInsideReader, equalDepth, readerInsideBinder, insideArm]) {
		const compiled = await compile(source);
		expect(compiled.semanticGraph.diagnostics).toEqual([]);
		// One handle node, spelled the same by the element that carries the id and
		// by the attribute that names it. Everything below is about the token the
		// two sides prepend to it.
		expect(idSlots(compiled)).toEqual([
			['aria-labelledby', 'shared:src/spike.tsrx#modal/element:titleEl'],
			['id', 'shared:src/spike.tsrx#modal/element:titleEl'],
		]);
	}
});

test('a projecting PART registers no instance token of its own (defect 65)', async () => {
	const compiled = await compile(binderInsideReader);
	const registrations = instanceRegistrations(seedChildSource(compiled));

	// `component-edge:0` is `Root`, `component-edge:2` is `Content` and
	// `component-edge:3` is `Title`. Before the fix all three wrote the token
	// unguarded, so `Title`, rendered inside Content's projection, minted
	// `mx-c0-p2-...` while Content's own `aria-labelledby` — restored to the
	// enclosing instance by the root edge — spelled `mx-c0-...`.
	expect(registrations).toEqual([
		{ edgeId: 'component-edge:0', instancePath: '"c0:"', guarded: false },
		{ edgeId: 'component-edge:2', instancePath: '"c0:p2:"', guarded: true },
		{ edgeId: 'component-edge:3', instancePath: '"c0:p2:p3:"', guarded: true },
	]);
	// The guard is not decoration: only the rooting component carries the marker
	// it reads, so Content's registration never runs and its parts mint from the
	// token Root wrote.
	expect(widgetRootMarkers(compiled)).toEqual(['marklessRenderSsr']);
});

test('the widget root still registers unguarded when parts sit at one depth', async () => {
	const compiled = await compile(equalDepth);

	// The collapsible shape never hit the defect and its root is untouched: one
	// unguarded registration, naming the instance the root started. The two parts
	// project their own children and register nothing unless they root a widget.
	expect(instanceRegistrations(seedChildSource(compiled))).toEqual([
		{ edgeId: 'component-edge:0', instancePath: '"c0:"', guarded: false },
		{ edgeId: 'component-edge:1', instancePath: '"c0:p1:"', guarded: true },
		{ edgeId: 'component-edge:2', instancePath: '"c0:p2:"', guarded: true },
	]);
});

test('the reader nested inside the binder is the same answer', async () => {
	const compiled = await compile(readerInsideBinder);

	// Which of the two parts does the projecting is not what decides the token:
	// neither roots a widget, so neither may name one.
	expect(instanceRegistrations(seedChildSource(compiled))).toEqual([
		{ edgeId: 'component-edge:0', instancePath: '"c0:"', guarded: false },
		{ edgeId: 'component-edge:1', instancePath: '"c0:p1:"', guarded: true },
		{ edgeId: 'component-edge:2', instancePath: '"c0:p1:p2:"', guarded: true },
	]);
});

test('a part an arm holds mints from the widget it belongs to, not from its arm', async () => {
	const compiled = await compile(insideArm);
	const registrations = instanceRegistrations(seedChildSource(compiled));

	// The arm decides WHETHER the part renders, never which widget it is part of,
	// so the arm-held `Content` is guarded exactly like the unconditional one.
	expect(registrations.map((entry) => entry.guarded)).toEqual([false, true, true]);
	expect(registrations[0]).toEqual({
		edgeId: 'component-edge:0',
		instancePath: '"c0:"',
		guarded: false,
	});
});

test('a part with no rooted instance refuses loudly rather than minting a stray id', async () => {
	const compiled = await compile(binderInsideReader);
	const source = compiled.publicRenderModule.ssrModuleSource ?? '';

	// What the guard leans on: withholding the token is fail-closed. A part
	// rendered where no widget root registered one throws instead of minting an
	// id from whatever prefix happened to be in scope, which is what would leave
	// an IDREF pointing at nothing.
	expect(source).toContain(
		// The per-FAMILY token is asked first now, because one element can carry
		// handles from two widget instances; the plain key is the fallback, and
		// neither answering is still the loud refusal.
		`${JSON.stringify(MARKLESS_WIDGET_INSTANCE_KEY)}+'|'+residue.handleGraphNodeId.slice(0,residue.handleGraphNodeId.indexOf('/')))??marklessSsrRenderStateValues.get(${JSON.stringify(MARKLESS_WIDGET_INSTANCE_KEY)}))??(()=>{throw new Error('MARKLESS_ELEMENT_HANDLE_WIDGET_INSTANCE_MISSING: '`,
	);
});

test('a nested root of the same family still starts an instance of its own', async () => {
	const nestedRoot = `${family}
export function Page() @{
	<section>
		<Root open={true}>
			<Content>
				<Root open={false}>
					<Title>Terms</Title>
				</Root>
			</Content>
		</Root>
	</section>
}
`;
	const compiled = await compile(nestedRoot);
	const registrations = instanceRegistrations(seedChildSource(compiled));

	// T053's boundary is untouched: a ROOT nested in another root's projection is
	// where the outer instance ends, so it registers a token — and the compiler
	// proves it roots one here, so it registers unguarded.
	expect(registrations.find((entry) => entry.instancePath === '"c0:p1:p2:"')).toEqual({
		edgeId: 'component-edge:2',
		instancePath: '"c0:p1:p2:"',
		guarded: false,
	});
	// The part that merely projects around it is still guarded.
	expect(registrations.find((entry) => entry.edgeId === 'component-edge:1')?.guarded).toBe(true);
});
