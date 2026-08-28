import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';

/**
 * A roster count handed to a child component as a bare prop is still a
 * placeholder: the prop carries the very string the render minted, so the child
 * can PRINT it and cannot SPEND it any more than the deriving component could.
 *
 * The child's render is judged by the same rule under the name the child gave
 * the prop. A spend its markup prints defers - the child's reader hands the
 * whole expression over as a thunk, exactly as the deriving component's does -
 * and every other spend is refused, naming the prop, the child, and the
 * operation. This file pins that carry, one level and two levels deep.
 */

const CODE = 'MARKLESS_ROSTER_COUNT_NOT_A_NUMBER';

const PRELUDE = `
import { computed, element, shared, state } from '@markless/core';

export const ic = shared(
	() => {
		const s = state({ step: 0, seen: 0 });
		const itemEls = element<HTMLDivElement[]>();
		return { ...s, itemEls };
	},
	{ scope: 'widget' },
);
`;

async function compile(source: string) {
	return compileTsrxModule({ filename: 'src/Ic.tsrx', source: PRELUDE + source, symbols: [] });
}

function refusals(result: Awaited<ReturnType<typeof compile>>) {
	return result.semanticGraph.diagnostics.filter((diagnostic) => diagnostic.code === CODE);
}

function deferred(result: Awaited<ReturnType<typeof compile>>) {
	return (result.semanticGraph.elementRosterCounts ?? []).flatMap(
		(record) => record.deferred ?? [],
	);
}

function readerFor(result: Awaited<ReturnType<typeof compile>>, componentName: string) {
	return result.publicRenderModule.componentDefinitions.find(
		(definition) => definition.name === componentName,
	)?.residueReaderSource;
}

/** The shape U734 always admitted, now admitted for a reason rather than by omission. */
test('a count printed in the child it was passed to stays legal', async () => {
	const result = await compile(`
function IcLabel({ total }) @{
	<span data-label ui-max={total}>{total}</span>
}

export function IcRoot() @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<div data-ic-root><IcLabel total={total} /></div>
}
`);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(deferred(result)).toEqual([]);
});

/**
 * The gap U734 and U736 both left open. The entry is attributed to the CHILD,
 * because that is the component whose reader has to carry the thunk, and the
 * lowered read names the child's own parameter - the placeholder crossed the
 * edge as the prop's value, so the call takes it under that name.
 */
test("a count spent in the child's attribute defers under the child's name", async () => {
	const result = await compile(`
function IcLabel({ total }) @{
	<span data-label ui-last={total - 1}>{total}</span>
}

export function IcRoot() @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<div data-ic-root ui-max={total}><IcLabel total={total} /></div>
}
`);

	expect(refusals(result)).toEqual([]);
	expect(deferred(result)).toEqual([
		{
			source: 'total - 1',
			thunkSource: 'marklessCountValue(total) - 1',
			componentName: 'IcLabel',
		},
	]);
});

/** The deferral is not just a record: the child's own reader emits the thunk. */
test("the child's compiled reader hands the spend over as a thunk", async () => {
	const result = await compile(`
function IcLabel({ total }) @{
	<span data-label ui-last={total - 1}>{total}</span>
}

export function IcRoot() @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<div data-ic-root ui-max={total}><IcLabel total={total} /></div>
}
`);

	const reader = readerFor(result, 'IcLabel');
	expect(reader).toContain('deferCount');
	expect(reader).toContain('(marklessCountValue)=>(marklessCountValue(total) - 1)');
	// The prop is bound from the child's own props, which is where the
	// placeholder is: the parent read its computed and passed the value across.
	expect(reader).toContain('read("prop:total")');
	// The server module reaches the same registry through the render context the
	// parent spreads into the child's render.
	expect(result.publicRenderModule.ssrModuleSource).toContain(
		'marklessSsrDeferRosterCount((marklessCountValue)=>(marklessCountValue(total) - 1))',
	);
});

/** A text slot in the child defers the same way an attribute value does. */
test("a count spent in the child's text defers", async () => {
	const result = await compile(`
function IcLabel({ total }) @{
	<span data-label>{\`\${total - 1} left\`}</span>
}

export function IcRoot() @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<div data-ic-root ui-max={total}><IcLabel total={total} /></div>
}
`);

	expect(refusals(result)).toEqual([]);
	expect(deferred(result)[0]?.thunkSource).toContain('marklessCountValue(total) - 1');
	expect(deferred(result)[0]?.componentName).toBe('IcLabel');
});

/**
 * The count is followed by BINDING, not by name: the child took it out under
 * `max`, so that is the name the thunk lowers and the name a refusal would use.
 */
test('a renamed prop carries the count under its new name', async () => {
	const result = await compile(`
function IcLabel({ max }) @{
	<span data-label ui-last={max - 1}>{max}</span>
}

export function IcRoot() @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<div data-ic-root ui-max={total}><IcLabel max={total} /></div>
}
`);

	expect(refusals(result)).toEqual([]);
	expect(deferred(result)).toEqual([
		{ source: 'max - 1', thunkSource: 'marklessCountValue(max) - 1', componentName: 'IcLabel' },
	]);
});

/**
 * Two levels. Nothing about the second hop is special - the child passes a bare
 * prop on exactly as the root did - so the grandchild's spend defers under the
 * grandchild's name, and the middle component that only forwards it says nothing.
 */
test('a count passed two levels down defers in the component that spends it', async () => {
	const result = await compile(`
function IcCount({ shown }) @{
	<b data-count ui-last={shown - 1}>{shown}</b>
}

function IcLabel({ total }) @{
	<span data-label><IcCount shown={total} /></span>
}

export function IcRoot() @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<div data-ic-root ui-max={total}><IcLabel total={total} /></div>
}
`);

	expect(refusals(result)).toEqual([]);
	expect(deferred(result)).toEqual([
		{
			source: 'shown - 1',
			thunkSource: 'marklessCountValue(shown) - 1',
			componentName: 'IcCount',
		},
	]);
	expect(readerFor(result, 'IcCount')).toContain('marklessCountValue(shown) - 1');
});

/**
 * The refusal the packet's fallback promised, landed for the shapes a thunk
 * cannot reach wherever the count is. It names the prop, the child, and the
 * operation, and says where the count came from so the author can find it.
 */
test("a derive off the prop in the child is refused, naming the prop and the child", async () => {
	const result = await compile(`
function IcLabel({ total }) @{
	const last = computed(() => total - 1);

	<span data-label ui-last={last}>{total}</span>
}

export function IcRoot() @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<div data-ic-root><IcLabel total={total} /></div>
}
`);

	const [refusal, ...rest] = refusals(result);
	expect(rest).toEqual([]);
	expect(refusal?.message).toContain('"total"');
	expect(refusal?.message).toContain('IcLabel');
	expect(refusal?.message).toContain('a "-" operation');
	expect(refusal?.message).toContain('the roster count IcRoot derives');
	expect(deferred(result)).toEqual([]);
});

/** An arm test decides whether markup exists at all, in the child as in the root. */
test('an arm test on the prop in the child is refused', async () => {
	const result = await compile(`
function IcLabel({ total }) @{
	<span data-label>
		@if (total > 1) {
			<b>many</b>
		}
	</span>
}

export function IcRoot() @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<div data-ic-root><IcLabel total={total} /></div>
}
`);

	expect(refusals(result)).toHaveLength(1);
	expect(refusals(result)[0]?.message).toContain('IcLabel');
	expect(deferred(result)).toEqual([]);
});

/** A handler in the child runs after paint, when the prop holds a number. */
test('a handler in the child may spend the prop freely', async () => {
	const result = await compile(`
function IcLabel({ total }) @{
	const w = ic();

	<button
		type="button"
		onClick={() => {
			w.seen = total - 1;
		}}
	>{total}</button>
}

export function IcRoot() @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<div data-ic-root><IcLabel total={total} /></div>
}
`);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(deferred(result)).toEqual([]);
});

/**
 * Only a BARE pass routes. A count stringified into a template reaches the child
 * as text with the placeholder buried in it - the page still answers the run,
 * but nothing there is a number to spend, so the child's local is not the count.
 */
test('a count stringified into a prop template is not routed', async () => {
	const result = await compile(`
function IcLabel({ label }) @{
	<span data-label ui-label={label + '!'}>{label}</span>
}

export function IcRoot() @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<div data-ic-root><IcLabel label={\`of \${total}\`} /></div>
}
`);

	expect(refusals(result)).toEqual([]);
	expect(deferred(result)).toEqual([]);
});

/**
 * Spending the count in the prop EXPRESSION is still refused: the token would
 * cross the edge as an ordinary string nobody in the child knows to resolve.
 */
test('spending the count in the prop expression itself is still refused', async () => {
	const result = await compile(`
function IcLabel({ total }) @{
	<span data-label>{total}</span>
}

export function IcRoot() @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<div data-ic-root><IcLabel total={total - 1} /></div>
}
`);

	const [refusal, ...rest] = refusals(result);
	expect(rest).toEqual([]);
	expect(refusal?.message).toContain('a "-" operation');
	expect(deferred(result)).toEqual([]);
});

/**
 * The hole this card did NOT close, pinned so it is a known one rather than a
 * surprise: the routing follows a prop into a child the SAME MODULE declares.
 * A child imported from another module is not walked here, so its spend is
 * neither deferred nor refused - it needs a linking-time pass that has both
 * modules' graphs in hand.
 */
test('a count passed to a child in another module is not routed', async () => {
	const result = await compile(`
import { IcLabel } from './IcLabel.tsrx';

export function IcRoot() @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<div data-ic-root ui-max={total}><IcLabel total={total} /></div>
}
`);

	expect(refusals(result)).toEqual([]);
	expect(deferred(result)).toEqual([]);
});
