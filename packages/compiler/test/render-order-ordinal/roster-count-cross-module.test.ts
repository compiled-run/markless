import { expect, test } from 'vitest';
import { compileTsrxModulesWithInterfaces } from '../multi-module-compile-support.ts';

/**
 * A roster count handed to a child in ANOTHER module is still a placeholder
 * there. The routing walk cannot follow it: the child's body is not in this
 * compile. What is in this compile is the interface that child's own module
 * published, which says which of its props it spends and in what operation.
 *
 * So the edge is judged from the two halves. The child's module records the
 * spend; the module deriving the count reads that record back and refuses,
 * naming the prop, the component that spends it, and the operation - wherever
 * along the chain of modules the spend actually is.
 *
 * A spend a markup slot prints DEFERS when the count and the spend are in one
 * module: the spending component's compiled reader carries the thunk. Across an
 * edge it cannot, because that module was emitted before this one learned a
 * count reaches it, so it is refused with the rest.
 */

const CODE = 'MARKLESS_ROSTER_COUNT_NOT_A_NUMBER';

const ROOT_PRELUDE = `
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

type Module = { readonly filename: string; readonly source: string; readonly importSource: string };

async function compileChain(...modules: ReadonlyArray<Module>) {
	return compileTsrxModulesWithInterfaces(modules);
}

/** The module deriving the count is always compiled last, so it links the rest. */
function root(source: string): Module {
	return {
		filename: 'src/IcRoot.tsrx',
		source: ROOT_PRELUDE + source,
		importSource: './IcRoot.tsrx',
	};
}

function refusals(result: { semanticGraph: { diagnostics: ReadonlyArray<{ code: string }> } }) {
	return result.semanticGraph.diagnostics.filter((diagnostic) => diagnostic.code === CODE);
}

function propSpendsFor(
	result: Awaited<ReturnType<typeof compileChain>>[number],
	componentName: string,
) {
	return result.moduleGraphInterface.render.components.find(
		(component) => component.componentName === componentName,
	)?.propSpends;
}

/** The mechanism row: a module says what it does with a prop, whoever passes it. */
test("a module publishes which of its components' props are spent", async () => {
	const [label] = await compileChain(
		{
			filename: 'src/IcLabel.tsrx',
			source: `
export function IcLabel({ total, caption }) @{
	<span data-label ui-last={total - 1}>{caption}</span>
}
`,
			importSource: './IcLabel.tsrx',
		},
		root(`
import { IcLabel } from './IcLabel.tsrx';

export function IcRoot() @{
	const w = ic();

	<div data-ic-root><IcLabel total={1} caption="x" /></div>
}
`),
	);

	expect(propSpendsFor(label!, 'IcLabel')).toEqual([
		{
			prop: 'total',
			componentName: 'IcLabel',
			localName: 'total',
			operation: 'a "-" operation',
			source: 'total - 1',
		},
	]);
});

/** A printed prop carries the placeholder verbatim, in another module as in this one. */
test('a count printed in an imported child stays legal', async () => {
	const [, rootResult] = await compileChain(
		{
			filename: 'src/IcLabel.tsrx',
			source: `
export function IcLabel({ total }) @{
	<span data-label ui-max={total}>{total}</span>
}
`,
			importSource: './IcLabel.tsrx',
		},
		root(`
import { computed } from '@markless/core';
import { IcLabel } from './IcLabel.tsrx';

export function IcRoot() @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<div data-ic-root ui-max={total}><IcLabel total={total} /></div>
}
`),
	);

	expect(rootResult!.semanticGraph.diagnostics).toEqual([]);
});

/**
 * The silent wrong number this closes. Same-module this shape defers; across
 * the edge the thunk has nowhere to be emitted, so it is named instead.
 */
test("a count spent in an imported child's attribute is refused", async () => {
	const [, rootResult] = await compileChain(
		{
			filename: 'src/IcLabel.tsrx',
			source: `
export function IcLabel({ total }) @{
	<span data-label ui-last={total - 1}>{total}</span>
}
`,
			importSource: './IcLabel.tsrx',
		},
		root(`
import { computed } from '@markless/core';
import { IcLabel } from './IcLabel.tsrx';

export function IcRoot() @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<div data-ic-root ui-max={total}><IcLabel total={total} /></div>
}
`),
	);

	const [refusal, ...rest] = refusals(rootResult!) as ReadonlyArray<{ message: string }>;
	expect(rest).toEqual([]);
	expect(refusal?.message).toContain('"total"');
	expect(refusal?.message).toContain('IcLabel');
	expect(refusal?.message).toContain('a "-" operation');
	expect(refusal?.message).toContain('("total - 1")');
	expect(refusal?.message).toContain('the roster count IcRoot derives');
});

/** A text slot crosses the edge the same way an attribute value does. */
test("a count spent in an imported child's text is refused", async () => {
	const [, rootResult] = await compileChain(
		{
			filename: 'src/IcLabel.tsrx',
			source: `
export function IcLabel({ total }) @{
	<span data-label>{\`\${total - 1} left\`}</span>
}
`,
			importSource: './IcLabel.tsrx',
		},
		root(`
import { computed } from '@markless/core';
import { IcLabel } from './IcLabel.tsrx';

export function IcRoot() @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<div data-ic-root ui-max={total}><IcLabel total={total} /></div>
}
`),
	);

	expect(refusals(rootResult!)).toHaveLength(1);
	expect((refusals(rootResult!)[0] as { message: string }).message).toContain(
		'a "-" operation',
	);
});

/** The shape no thunk reaches anywhere: a second derive off the prop. */
test('a derive off the prop in an imported child is refused, naming prop and child', async () => {
	const [, rootResult] = await compileChain(
		{
			filename: 'src/IcLabel.tsrx',
			source: `
import { computed } from '@markless/core';

export function IcLabel({ total }) @{
	const last = computed(() => total - 1);

	<span data-label ui-last={last}>{total}</span>
}
`,
			importSource: './IcLabel.tsrx',
		},
		root(`
import { computed } from '@markless/core';
import { IcLabel } from './IcLabel.tsrx';

export function IcRoot() @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<div data-ic-root><IcLabel total={total} /></div>
}
`),
	);

	const [refusal, ...rest] = refusals(rootResult!) as ReadonlyArray<{ message: string }>;
	expect(rest).toEqual([]);
	expect(refusal?.message).toContain('"total"');
	expect(refusal?.message).toContain('IcLabel');
	expect(refusal?.message).toContain('a "-" operation');
});

/** The count is followed by BINDING: the child names it what its signature says. */
test('a renamed prop is refused under the name the imported child gave it', async () => {
	const [, rootResult] = await compileChain(
		{
			filename: 'src/IcLabel.tsrx',
			source: `
export function IcLabel({ max }) @{
	<span data-label ui-last={max - 1}>{max}</span>
}
`,
			importSource: './IcLabel.tsrx',
		},
		root(`
import { computed } from '@markless/core';
import { IcLabel } from './IcLabel.tsrx';

export function IcRoot() @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<div data-ic-root><IcLabel max={total} /></div>
}
`),
	);

	const [refusal, ...rest] = refusals(rootResult!) as ReadonlyArray<{ message: string }>;
	expect(rest).toEqual([]);
	expect(refusal?.message).toContain('"max"');
	expect(refusal?.message).toContain('("max - 1")');
	expect(refusal?.message).toContain('The prop carries "total"');
});

/**
 * Two levels across three modules. The middle module only forwards the prop, so
 * it publishes the third module's spend under its OWN prop name, and the module
 * deriving the count is answered without ever seeing either body.
 */
test('a count passed two module edges down is refused where it is spent', async () => {
	const [count, label, rootResult] = await compileChain(
		{
			filename: 'src/IcCount.tsrx',
			source: `
export function IcCount({ shown }) @{
	<b data-count ui-last={shown - 1}>{shown}</b>
}
`,
			importSource: './IcCount.tsrx',
		},
		{
			filename: 'src/IcLabel.tsrx',
			source: `
import { IcCount } from './IcCount.tsrx';

export function IcLabel({ total }) @{
	<span data-label><IcCount shown={total} /></span>
}
`,
			importSource: './IcLabel.tsrx',
		},
		root(`
import { computed } from '@markless/core';
import { IcLabel } from './IcLabel.tsrx';

export function IcRoot() @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<div data-ic-root ui-max={total}><IcLabel total={total} /></div>
}
`),
	);

	expect(propSpendsFor(count!, 'IcCount')?.[0]?.localName).toBe('shown');
	// The forwarding module republishes the spend under the prop IT takes.
	expect(propSpendsFor(label!, 'IcLabel')).toEqual([
		{
			prop: 'total',
			componentName: 'IcCount',
			localName: 'shown',
			operation: 'a "-" operation',
			source: 'shown - 1',
		},
	]);
	const [refusal, ...rest] = refusals(rootResult!) as ReadonlyArray<{ message: string }>;
	expect(rest).toEqual([]);
	expect(refusal?.message).toContain('"shown"');
	expect(refusal?.message).toContain('IcCount');
	expect(refusal?.message).toContain('the roster count IcRoot derives');
});

/** Only a BARE pass routes: a template hands the child text, not a number. */
test('a count stringified into an imported child prop is not routed', async () => {
	const [, rootResult] = await compileChain(
		{
			filename: 'src/IcLabel.tsrx',
			source: `
export function IcLabel({ label }) @{
	<span data-label ui-label={label + '!'}>{label}</span>
}
`,
			importSource: './IcLabel.tsrx',
		},
		root(`
import { computed } from '@markless/core';
import { IcLabel } from './IcLabel.tsrx';

export function IcRoot() @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<div data-ic-root><IcLabel label={\`of \${total}\`} /></div>
}
`),
	);

	expect(refusals(rootResult!)).toEqual([]);
});

/** The guard is keyed to the count: an ordinary prop reaching the same spend is fine. */
test('an ordinary value passed to the same spending child is not refused', async () => {
	const [, rootResult] = await compileChain(
		{
			filename: 'src/IcLabel.tsrx',
			source: `
export function IcLabel({ total }) @{
	<span data-label ui-last={total - 1}>{total}</span>
}
`,
			importSource: './IcLabel.tsrx',
		},
		root(`
import { computed } from '@markless/core';
import { IcLabel } from './IcLabel.tsrx';

export function IcRoot() @{
	const w = ic();
	const doubled = computed(() => w.step * 2);

	<div data-ic-root><IcLabel total={doubled} /></div>
}
`),
	);

	expect(rootResult!.semanticGraph.diagnostics).toEqual([]);
});

/** A handler in the imported child runs after paint; the prop is a number by then. */
test('a handler spend in an imported child is not published as a spend', async () => {
	const [label, rootResult] = await compileChain(
		{
			filename: 'src/IcLabel.tsrx',
			source: `
export function IcLabel({ total, onPick }) @{
	<button
		type="button"
		onClick={() => {
			onPick(total - 1);
		}}
	>{total}</button>
}
`,
			importSource: './IcLabel.tsrx',
		},
		root(`
import { computed } from '@markless/core';
import { IcLabel } from './IcLabel.tsrx';

export function IcRoot() @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<div data-ic-root><IcLabel total={total} onPick={(n) => { w.seen = n; }} /></div>
}
`),
	);

	expect(propSpendsFor(label!, 'IcLabel')).toBeUndefined();
	expect(refusals(rootResult!)).toEqual([]);
});
