import { expect, test } from 'vitest';
import { buildSemanticGraph, compileTsrxModule } from '../src/index.ts';
import { IDREF_LIST_ATTRIBUTES } from '../src/passes/semantic-graph/idref-attributes.ts';

// A description and an error are separate handles, and one part must be able to
// name both: `aria-describedby={[a.errorEl, a.descriptionEl]}` is the list form.
// It lowers to the space-joined minted ids in the authored order, and a handle
// whose part never rendered drops out rather than dangling.

async function graphOf(name: string, source: string) {
	return await buildSemanticGraph({ filename: `src/${name}.tsrx`, source });
}

const codes = (graph: Awaited<ReturnType<typeof buildSemanticGraph>>) =>
	graph.diagnostics.map((diagnostic) => diagnostic.code);

/** Every attribute slot rendered from minted element() ids, in emitted order. */
const idSlots = (graph: Awaited<ReturnType<typeof buildSemanticGraph>>) =>
	graph.markup.chunks.flatMap((chunk) =>
		chunk.slots.flatMap((slot) => {
			if (slot.kind !== 'attribute') return [];
			if (slot.residue.kind === 'element-handle-id')
				return [[slot.name, [slot.residue.handleGraphNodeId]] as const];
			if (slot.residue.kind === 'element-handle-id-list')
				return [[slot.name, slot.residue.handleGraphNodeIds] as const];
			return [];
		}),
	);

const twoDescriptions = `import { element } from '@markless/core';
export function App() @{
	const errorEl = element<HTMLParagraphElement>();
	const descriptionEl = element<HTMLParagraphElement>();
	<div>
		<input aria-describedby={[errorEl, descriptionEl]} />
		<p el={errorEl}>Too short</p>
		<p el={descriptionEl}>At least 8 characters</p>
	</div>
}`;

test('the list positions are one named constant, and the single-valued ones are out', () => {
	// `popovertarget` and `for` take exactly one id in HTML: a list there is a
	// broken attribute, not a richer one.
	expect([...IDREF_LIST_ATTRIBUTES].sort()).toEqual([
		'aria-controls',
		'aria-describedby',
		'aria-labelledby',
	]);
});

test('two handles in one IDREF position record two relationships in authored order', async () => {
	const graph = await graphOf('TwoDescriptions', twoDescriptions);

	expect(graph.diagnostics).toEqual([]);
	expect(
		graph.elementHandleIdrefs.map((idref) => [
			idref.attributeName,
			idref.handleName,
			idref.hostNodeId,
			idref.boundHostNodeId,
			idref.order,
		]),
	).toEqual([
		['aria-describedby', 'errorEl', 'h1', 'h2', 0],
		['aria-describedby', 'descriptionEl', 'h1', 'h3', 1],
	]);
	// One slot carrying both ids in the order they were written, plus the id each
	// referenced element mints for itself.
	expect(idSlots(graph)).toEqual([
		['aria-describedby', ['element:errorEl', 'element:descriptionEl']],
		['id', ['element:errorEl']],
		['id', ['element:descriptionEl']],
	]);
	expect(graph.templateReads).toEqual([]);
});

test('aria-labelledby and aria-controls take lists too', async () => {
	const graph = await graphOf(
		'ListPositions',
		`import { element } from '@markless/core';
export function App() @{
	const first = element<HTMLSpanElement>();
	const second = element<HTMLSpanElement>();
	<div>
		<div role="group" aria-labelledby={[first, second]}>Body</div>
		<button aria-controls={[first, second]}>Toggle</button>
		<span el={first}>A</span>
		<span el={second}>B</span>
	</div>
}`,
	);

	expect(graph.diagnostics).toEqual([]);
	expect(graph.elementHandleIdrefs.map((idref) => idref.attributeName)).toEqual([
		'aria-labelledby',
		'aria-labelledby',
		'aria-controls',
		'aria-controls',
	]);
});

test('a one-handle list is the single form it spells', async () => {
	const graph = await graphOf(
		'SingleList',
		`import { element } from '@markless/core';
export function App() @{
	const hint = element<HTMLParagraphElement>();
	<div>
		<input aria-describedby={[hint]} />
		<p el={hint}>Hint</p>
	</div>
}`,
	);

	expect(graph.diagnostics).toEqual([]);
	expect(idSlots(graph)).toEqual([
		['aria-describedby', ['element:hint']],
		['id', ['element:hint']],
	]);
	// Not a list residue: one handle is one id, so it takes the same slot shape
	// `aria-describedby={hint}` has always taken.
	expect(
		graph.markup.chunks.some((chunk) =>
			chunk.slots.some(
				(slot) => 'residue' in slot && slot.residue.kind === 'element-handle-id-list',
			),
		),
	).toBe(false);
});

test('a list in a single-valued IDREF position is refused, and says why', async () => {
	for (const attributeName of ['popovertarget', 'for']) {
		const source = `import { element } from '@markless/core';
export function App() @{
	const first = element<HTMLDivElement>();
	const second = element<HTMLDivElement>();
	<div>
		<button ${attributeName}={[first, second]}>Open</button>
		<div el={first}>A</div>
		<div el={second}>B</div>
	</div>
}`;
		const graph = await graphOf('SingleValued', source);

		expect(graph.elementHandleIdrefs).toEqual([]);
		expect(codes(graph)).toEqual(['MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE']);
		expect(graph.diagnostics[0]?.message).toContain(
			`${attributeName} names exactly one element`,
		);
	}
});

test('a list on a component tag is refused: the id crosses the edge as one value', async () => {
	const graph = await graphOf(
		'EdgeList',
		`import { element } from '@markless/core';
function Field(props) @{
	<input {...props} />
}
export function App() @{
	const first = element<HTMLSpanElement>();
	const second = element<HTMLSpanElement>();
	<div>
		<Field aria-describedby={[first, second]} />
		<span el={first}>A</span>
		<span el={second}>B</span>
	</div>
}`,
	);

	expect(graph.elementHandleIdrefs).toEqual([]);
	expect(codes(graph)).toContain('MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE');
	expect(graph.diagnostics[0]?.message).toContain('crosses the component edge as one value');
});

test('anything but a static list of handles stays refused', async () => {
	const shapes = [
		'[first, ...more]',
		'[first, flag ? first : second]',
		'flag ? [first] : [second]',
		'[first, second].slice(0, 1)',
	];
	for (const shape of shapes) {
		const graph = await graphOf(
			'DynamicList',
			`import { element, state } from '@markless/core';
export function App() @{
	const first = element<HTMLSpanElement>();
	const second = element<HTMLSpanElement>();
	const flag = state(false);
	const more = [];
	<div>
		<p aria-describedby={${shape}}>Body</p>
		<span el={first}>A</span>
		<span el={second}>B</span>
	</div>
}`,
		);

		expect(graph.elementHandleIdrefs, shape).toEqual([]);
		expect(codes(graph), shape).toContain('MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE');
	}
});

test('an unbound handle inside a list is the unbound refusal, per element', async () => {
	const graph = await graphOf(
		'UnboundInList',
		`import { element } from '@markless/core';
export function App() @{
	const errorEl = element<HTMLParagraphElement>();
	const descriptionEl = element<HTMLParagraphElement>();
	<div>
		<input aria-describedby={[errorEl, descriptionEl]} />
		<p el={errorEl}>Too short</p>
	</div>
}`,
	);

	expect(codes(graph)).toEqual(['MARKLESS_ELEMENT_HANDLE_IDREF_UNBOUND']);
	// The bound half still records; only the dangling half is refused.
	expect(graph.elementHandleIdrefs.map((idref) => idref.handleName)).toEqual(['errorEl']);
});

async function compile(source: string) {
	return await compileTsrxModule({
		filename: 'src/spike.tsrx',
		source,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
}

const listFamily = `
import { element, shared, state } from '@markless/core';

export const field = shared(() => {
	const s = state({ invalid: false });
	const errorEl = element<HTMLParagraphElement>();
	const descriptionEl = element<HTMLParagraphElement>();
	return { ...s, errorEl, descriptionEl };
}, { scope: 'widget' });

export function Root({ children }) @{
	const f = field();
	f.invalid = false;

	<div data-root>{children}</div>
}

export function Control() @{
	const f = field();

	<input aria-describedby={[f.errorEl, f.descriptionEl]} />
}

export function ErrorText({ children }) @{
	const f = field();

	<p el={f.errorEl}>{children}</p>
}

export function Description({ children }) @{
	const f = field();

	<p el={f.descriptionEl}>{children}</p>
}

export function Page() @{
	<Root>
		<Control />
		<ErrorText>bad</ErrorText>
		<Description>hint</Description>
	</Root>
}
`;

test('the list branch joins bound ids and omits the parts that never rendered', async () => {
	const compiled = await compile(listFamily);
	const source = compiled.publicRenderModule.ssrModuleSource ?? '';

	expect(compiled.semanticGraph.diagnostics).toEqual([]);
	// The list reads the SAME per-handle mint the single form reads, filters the
	// handles this widget bound nothing for, and joins what is left with a space.
	expect(source).toContain("residue.kind==='element-handle-id-list'");
	expect(source).toContain(".join(' ')");
});

test('a module whose IDREFs are all single carries no list branch', async () => {
	const compiled = await compile(`
import { element } from '@markless/core';
export function App() @{
	const hint = element<HTMLParagraphElement>();
	<div>
		<input aria-describedby={hint} />
		<p el={hint}>Hint</p>
	</div>
}
`);
	const source = compiled.publicRenderModule.ssrModuleSource ?? '';

	expect(compiled.semanticGraph.diagnostics).toEqual([]);
	expect(source).toContain("residue.kind==='element-handle-id'");
	// Pay-per-use: the list costs nothing on the pages that never write one.
	expect(source).not.toContain('element-handle-id-list');
});
