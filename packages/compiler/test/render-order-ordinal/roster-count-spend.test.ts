import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';

/**
 * A roster count is exact when it is PRINTED and wrong when it is SPENT.
 *
 * Server render is one forward pass: the part asking how many members its
 * family has renders before - or in the middle of - the members it is counting,
 * so the render writes a placeholder and the composed page answers every one it
 * wrote. That survives being printed into text or an attribute value. It does
 * not survive arithmetic or a comparison, which run against the placeholder
 * string and paint a wrong value nothing reports.
 *
 * This file pins where the compiler draws that line.
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

/**
 * The three printed shapes real families actually write: the root's `ui-max`,
 * the bare text node, and the "2 of 5" template. A template slot is transparent
 * - the count is stringified into the text either way - so the surrounding
 * literal text is not a spend and the count is answered inside it.
 */
test('a printed count is admitted as an attribute, as text, and as a template slot', async () => {
	const result = await compile(`
export function IcRoot({ children }) @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<div data-ic-root ui-max={total} ui-label={\`step \${w.step} of \${total}\`}>{children}<span>{total}</span></div>
}
`);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.semanticGraph.elementRosterCounts).toHaveLength(1);
});

test('arithmetic on the count in an attribute is refused, naming the derivation and the operation', async () => {
	const result = await compile(`
export function IcRoot({ children }) @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<div data-ic-root ui-last={total - 1}>{children}</div>
}
`);

	const [refusal, ...rest] = refusals(result);
	expect(rest).toEqual([]);
	expect(refusal?.severity).toBe('error');
	expect(refusal?.message).toContain('roster count "total"');
	expect(refusal?.message).toContain('a "-" operation');
	expect(refusal?.message).toContain('total - 1');
	expect(refusal?.message).toContain('IcRoot');
});

/**
 * tour's forward-trigger gate, verbatim in shape. The refusal names the
 * innermost operation the count reaches, which is the one the author has to
 * move - the comparison around it is only wrong because the subtraction is.
 */
test('a comparison built on the count is refused', async () => {
	const result = await compile(`
export function IcTrigger() @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<button type="button" disabled={w.step >= total - 1}>next</button>
}
`);

	const [refusal, ...rest] = refusals(result);
	expect(rest).toEqual([]);
	expect(refusal?.message).toContain('a "-" operation');
});

test('a second computed deriving off the count is refused by its operation', async () => {
	const result = await compile(`
export function IcRoot({ children }) @{
	const w = ic();
	const total = computed(() => w.itemEls.length);
	const last = computed(() => total - 1);

	<div data-ic-root ui-last={last}>{children}</div>
}
`);

	const [refusal, ...rest] = refusals(result);
	expect(rest).toEqual([]);
	expect(refusal?.message).toContain('a "-" operation');
});

/**
 * A bare re-derivation looks harmless and is not: it publishes a SECOND binding
 * holding the placeholder, and nothing downstream knows to resolve that one.
 */
test('a computed that only forwards the count is refused as a derivation', async () => {
	const result = await compile(`
export function IcRoot({ children }) @{
	const w = ic();
	const total = computed(() => w.itemEls.length);
	const alias = computed(() => total);

	<div data-ic-root ui-max={alias}>{children}</div>
}
`);

	const [refusal, ...rest] = refusals(result);
	expect(rest).toEqual([]);
	expect(refusal?.message).toContain('a derivation of the count');
});

test('a local carrying the count forward is refused', async () => {
	const result = await compile(`
export function IcRoot({ children }) @{
	const w = ic();
	const total = computed(() => w.itemEls.length);
	const carried = total;

	<div data-ic-root ui-max={carried}>{children}</div>
}
`);

	expect(refusals(result)).toHaveLength(1);
});

/**
 * The other half of the rule, and the reason it is drawn at render time rather
 * than at every read: a handler runs after paint, when the count is a number in
 * the graph, so the arithmetic it does there is right.
 */
test('a handler may spend the count freely', async () => {
	const result = await compile(`
export function IcRoot({ children }) @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<div
		data-ic-root
		ui-max={total}
		onClick={() => {
			w.seen = total - 1;
		}}
	>{children}</div>
}
`);

	expect(result.semanticGraph.diagnostics).toEqual([]);
});

/**
 * The guard is keyed to the count, not to the name: a plain computed doing the
 * same arithmetic is untouched, because its value is a number at render.
 */
test('arithmetic on a computed that is not a roster count is untouched', async () => {
	const result = await compile(`
export function IcRoot({ children }) @{
	const w = ic();
	const total = computed(() => w.step + 2);

	<div data-ic-root ui-last={total - 1}>{children}</div>
}
`);

	expect(refusals(result)).toEqual([]);
	expect(result.semanticGraph.elementRosterCounts).toBeUndefined();
});
