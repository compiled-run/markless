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
 * A spend a markup text or attribute slot PRINTS is deferred instead of
 * refused: the slot hands the whole expression over as a thunk and the page
 * resolves it once the counts are facts. This file pins where the compiler
 * draws that line, and which shapes a thunk still cannot reach.
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

function deferred(result: Awaited<ReturnType<typeof compile>>) {
	return (result.semanticGraph.elementRosterCounts ?? []).flatMap(
		(record) => record.deferred ?? [],
	);
}

/**
 * The count read inside a deferred thunk is lowered to a CALL, not left on the
 * captured const: the const holds the placeholder this render minted and a
 * closure cannot be rebound after composition.
 */
test('arithmetic on the count in an attribute is deferred, with the read lowered to a call', async () => {
	const result = await compile(`
export function IcRoot({ children }) @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<div data-ic-root ui-last={total - 1}>{children}</div>
}
`);

	expect(refusals(result)).toEqual([]);
	expect(deferred(result)).toEqual([
		{ source: 'total - 1', thunkSource: 'marklessCountValue(total) - 1' },
	]);
});

/**
 * tour's forward-trigger gate, verbatim in shape. A boolean attribute defers
 * WHOLE - presence is the value - which the renderer decides, not this pass.
 */
test('a comparison built on the count is deferred', async () => {
	const result = await compile(`
export function IcTrigger() @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<button type="button" disabled={w.step >= total - 1}>next</button>
}
`);

	expect(refusals(result)).toEqual([]);
	expect(deferred(result)).toEqual([
		{
			source: 'w.step >= total - 1',
			thunkSource: 'w.step >= marklessCountValue(total) - 1',
		},
	]);
});

/** Template math around the count is one expression, so it defers as one. */
test('a template built with count arithmetic defers the whole template', async () => {
	const result = await compile(`
export function IcRoot({ children }) @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<div data-ic-root ui-label={\`\${w.step + 1} of \${total - 1}\`}>{children}</div>
}
`);

	expect(refusals(result)).toEqual([]);
	expect(deferred(result)[0]?.thunkSource).toContain('marklessCountValue(total) - 1');
});

/**
 * The shapes a thunk cannot reach. A token is spliced back over the text a text
 * or attribute slot printed; a prop crosses into another module's render as a
 * string nobody there knows to resolve, and an arm test decides whether markup
 * exists at all, long before there is a page to resolve against.
 */
test("a child component's prop spending the count is refused", async () => {
	const result = await compile(`
function IcLabel({ max }) @{
	<span>{max}</span>
}

export function IcRoot() @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<div data-ic-root><IcLabel max={total - 1} /></div>
}
`);

	const [refusal, ...rest] = refusals(result);
	expect(rest).toEqual([]);
	expect(refusal?.message).toContain('a "-" operation');
	expect(deferred(result)).toEqual([]);
});

test('an arm test spending the count is refused', async () => {
	const result = await compile(`
export function IcRoot({ children }) @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<div data-ic-root>
		@if (w.step >= total - 1) {
			<span>last</span>
		}
		{children}
	</div>
}
`);

	expect(refusals(result)).toHaveLength(1);
	expect(deferred(result)).toEqual([]);
});

/** A derive publishes a SECOND binding holding the placeholder, so it is refused
 * however simple its body, and named by the innermost operation the count reaches. */
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

/**
 * tour's real forward gate, which is written with parentheses around the second
 * arm. Authored parentheses are kept as AST nodes, and the walk out from the
 * read has to step through one: without that, the same expression defers
 * unparenthesized and is refused parenthesized - same precedence, opposite
 * verdict, and nothing in the message names the parentheses.
 */
test('parentheses around a spend do not change the verdict', async () => {
	const parenthesized = await compile(`
export function IcTrigger({ off = false, loop = false }) @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<button type="button" disabled={off === true || (loop !== true && w.step >= total - 1)}>next</button>
}
`);
	const bare = await compile(`
export function IcTrigger({ off = false, loop = false }) @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<button type="button" disabled={off === true || loop !== true && w.step >= total - 1}>next</button>
}
`);

	expect(refusals(parenthesized)).toEqual([]);
	expect(refusals(bare)).toEqual([]);
	expect(deferred(parenthesized)).toEqual([
		{
			source: 'off === true || (loop !== true && w.step >= total - 1)',
			thunkSource:
				'off === true || (loop !== true && w.step >= marklessCountValue(total) - 1)',
		},
	]);
	// The two spellings defer the same expression, parentheses aside.
	expect(deferred(parenthesized)[0]?.thunkSource.replace(/[()]/g, '')).toBe(
		deferred(bare)[0]?.thunkSource.replace(/[()]/g, ''),
	);
});
