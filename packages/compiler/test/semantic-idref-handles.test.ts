import { expect, test } from 'vitest';
import { buildSemanticGraph } from '../src/index.ts';
import { IDREF_ATTRIBUTES } from '../src/passes/semantic-graph/idref-attributes.ts';

// An element() handle is identity where the platform expects an IDREF. The
// author writes the relationship - `<span el={label}>` over there,
// `aria-labelledby={label}` over here - and never sees, spells, or collides
// with an id string. The graph records the relationship only; minting the id is
// the consuming emitter's lowering concern.

async function graphOf(name: string, source: string) {
	return await buildSemanticGraph({ filename: `src/${name}.tsrx`, source });
}

const statics = (graph: Awaited<ReturnType<typeof buildSemanticGraph>>) =>
	graph.markup.chunks.map((chunk) => chunk.statics.join('')).join('');

const codes = (graph: Awaited<ReturnType<typeof buildSemanticGraph>>) =>
	graph.diagnostics.map((diagnostic) => diagnostic.code);

test('the IDREF positions are one named constant', () => {
	// One constant so the set can grow. aria-activedescendant is deliberately
	// absent: it points at one row of a live collection, which needs per-row
	// identity this slice does not build.
	expect([...IDREF_ATTRIBUTES].sort()).toEqual([
		'aria-controls',
		'aria-describedby',
		'aria-labelledby',
		'for',
		'popovertarget',
	]);
});

test('a handle in an IDREF position records the relationship, not a templateRead', async () => {
	const source = `import { element } from '@markless/core';
export function App() @{
	const label = element<HTMLSpanElement>();
	<div>
		<span el={label}>Notifications</span>
		<div role="group" aria-labelledby={label}>Body</div>
	</div>
}`;
	const graph = await graphOf('Idref', source);
	const referenceStart = source.indexOf('label}>Body');

	expect(graph.diagnostics).toEqual([]);
	expect(graph.elementHandleIdrefs).toEqual([
		{
			hostNodeId: 'h2',
			attributeName: 'aria-labelledby',
			handleName: 'label',
			source: 'label',
			boundHostNodeId: 'h1',
			componentName: 'App',
			order: 0,
			sourceSpan: {
				filename: 'src/Idref.tsrx',
				start: referenceStart,
				end: referenceStart + 'label'.length,
			},
		},
	]);
	// The read is no longer an ordinary attribute binding: nothing may lower it
	// as a value write, and no empty aria-labelledby="" may reach the statics.
	expect(graph.templateReads).toEqual([]);
	expect(statics(graph)).not.toContain('aria-labelledby');
});

test('every IDREF position resolves its handle', async () => {
	const graph = await graphOf(
		'AllPositions',
		`import { element } from '@markless/core';
export function App() @{
	const panel = element<HTMLDivElement>();
	const hint = element<HTMLParagraphElement>();
	const field = element<HTMLInputElement>();
	const sheet = element<HTMLDivElement>();
	<div>
		<button aria-controls={panel}>Toggle</button>
		<div el={panel}>Panel</div>
		<input aria-describedby={hint} />
		<p el={hint}>Hint</p>
		<label for={field}>Name</label>
		<input el={field} />
		<button popovertarget={sheet}>Open</button>
		<div el={sheet} popover="auto">Sheet</div>
	</div>
}`,
	);

	expect(graph.diagnostics).toEqual([]);
	expect(
		graph.elementHandleIdrefs.map((idref) => [
			idref.attributeName,
			idref.handleName,
			idref.hostNodeId,
			idref.boundHostNodeId,
		]),
	).toEqual([
		['aria-controls', 'panel', 'h1', 'h2'],
		['aria-describedby', 'hint', 'h3', 'h4'],
		['for', 'field', 'h5', 'h6'],
		['popovertarget', 'sheet', 'h7', 'h8'],
	]);
});

test('a dangling IDREF handle is an error, not the suppressible unbound warning', async () => {
	// The worst a11y bug class: nothing renders wrong, nothing throws, and the
	// relation is simply absent. It has to stop the build.
	const source = `import { element } from '@markless/core';
export function App() @{
	const label = element<HTMLSpanElement>();
	<div role="group" aria-labelledby={label}>Body</div>
}`;
	const graph = await graphOf('Dangling', source);
	const referenceStart = source.indexOf('label}>Body');

	expect(graph.elementHandleIdrefs).toEqual([]);
	expect(codes(graph)).toEqual(['MARKLESS_ELEMENT_HANDLE_IDREF_UNBOUND']);
	expect(graph.diagnostics[0]).toEqual(
		expect.objectContaining({
			code: 'MARKLESS_ELEMENT_HANDLE_IDREF_UNBOUND',
			severity: 'error',
			phase: 'semantic-graph',
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
			title: 'element() handle is referenced but never bound',
			message:
				'Cannot resolve aria-labelledby={label} because "label" is never bound with el={label} in this component.',
			primarySpan: {
				filename: 'src/Dangling.tsrx',
				start: referenceStart,
				end: referenceStart + 'label'.length,
			},
			docsUrl: 'https://markless.dev/errors/MARKLESS_ELEMENT_HANDLE_IDREF_UNBOUND',
		}),
	);
});

test('a dangling IDREF handle cannot be suppressed with markless-allow', async () => {
	// markless-allow is a warning-only escape hatch, which is exactly why the
	// IDREF case is its own error rather than a promotion of the read warning.
	const graph = await graphOf(
		'DanglingAllow',
		`import { element } from '@markless/core';
export function App() @{
	const label = element<HTMLSpanElement>();
	// markless-allow MARKLESS_ELEMENT_HANDLE_IDREF_UNBOUND: intentional
	<div aria-labelledby={label}>Body</div>
}`,
	);

	expect(codes(graph)).toEqual(
		expect.arrayContaining([
			'MARKLESS_ELEMENT_HANDLE_IDREF_UNBOUND',
			'MARKLESS_ALLOW_ERROR_UNSUPPRESSIBLE',
		]),
	);
	expect(
		graph.diagnostics.find(
			(diagnostic) => diagnostic.code === 'MARKLESS_ELEMENT_HANDLE_IDREF_UNBOUND',
		)?.suppressed,
	).not.toBe(true);
});

test('the unbound read warning keeps its severity for non-IDREF reads', async () => {
	// Promoting MARKLESS_ELEMENT_HANDLE_UNBOUND globally would have made this
	// documented suppression illegal. Different failure, different code.
	const graph = await graphOf(
		'UnboundText',
		`import { element } from '@markless/core';
export function App() @{
	const label = element<HTMLSpanElement>();
	<p>{label}</p>
}`,
	);

	expect(graph.diagnostics).toEqual([
		expect.objectContaining({ code: 'MARKLESS_ELEMENT_HANDLE_UNBOUND', severity: 'warning' }),
	]);
	expect(graph.elementHandleIdrefs).toEqual([]);
});

test('a bound handle read outside an IDREF position is left alone', async () => {
	const graph = await graphOf(
		'BoundElsewhere',
		`import { element } from '@markless/core';
export function App() @{
	const box = element<HTMLDivElement>();
	<div>
		<div el={box} data-role="box">Box</div>
		<p title={box}>Title</p>
	</div>
}`,
	);

	expect(graph.elementHandleIdrefs).toEqual([]);
	expect(graph.templateReads.map((read) => [read.source, read.target])).toEqual([
		['box', { kind: 'attribute', name: 'title' }],
	]);
});

test('a non-handle value in an IDREF position stays an ordinary templateRead', async () => {
	const graph = await graphOf(
		'PlainIdref',
		`import { state } from '@markless/core';
export function App() @{
	const labelId = state('title-1');
	<div aria-labelledby={labelId}>Body</div>
}`,
	);

	expect(graph.diagnostics).toEqual([]);
	expect(graph.elementHandleIdrefs).toEqual([]);
	expect(graph.templateReads.map((read) => [read.source, read.target])).toEqual([
		['labelId', { kind: 'attribute', name: 'aria-labelledby' }],
	]);
	expect(statics(graph)).toContain('aria-labelledby="');
});

test('aria-activedescendant is not an IDREF position in this slice', async () => {
	// Out by design: it names one row of a live collection. Leaving it an
	// ordinary read keeps the row-identity decision where it belongs.
	const graph = await graphOf(
		'ActiveDescendant',
		`import { element } from '@markless/core';
export function App() @{
	const option = element<HTMLLIElement>();
	<ul aria-activedescendant={option}><li el={option}>One</li></ul>
}`,
	);

	expect(graph.elementHandleIdrefs).toEqual([]);
	expect(graph.templateReads.map((read) => read.target)).toEqual([
		{ kind: 'attribute', name: 'aria-activedescendant' },
	]);
});

test('the reference resolves when the referencing element sits inside an @if arm', async () => {
	const graph = await graphOf(
		'BranchedReference',
		`import { element, state } from '@markless/core';
export function App() @{
	const label = element<HTMLSpanElement>();
	const open = state(true);
	<main>
		<span el={label}>Notifications</span>
		@if (open) { <div aria-labelledby={label}>Body</div> }
	</main>
}`,
	);

	expect(codes(graph)).toEqual([]);
	expect(
		graph.elementHandleIdrefs.map((idref) => [idref.hostNodeId, idref.boundHostNodeId]),
	).toEqual([['h2', 'h1']]);
});

test('the reference resolves when the bound element sits inside an @if arm', async () => {
	const graph = await graphOf(
		'BranchedBinding',
		`import { element, state } from '@markless/core';
export function App() @{
	const label = element<HTMLSpanElement>();
	const open = state(true);
	<main>
		@if (open) { <span el={label}>Notifications</span> }
		<div aria-labelledby={label}>Body</div>
	</main>
}`,
	);

	expect(codes(graph)).toEqual([]);
	expect(
		graph.elementHandleIdrefs.map((idref) => [idref.hostNodeId, idref.boundHostNodeId]),
	).toEqual([['h2', 'h1']]);
});

test('overlay and an IDREF handle coexist on one element', async () => {
	const graph = await graphOf(
		'OverlayIdref',
		`import { element } from '@markless/core';
export function App() @{
	const heading = element<HTMLHeadingElement>();
	<main>
		<div overlay role="dialog" aria-labelledby={heading}>
			<h2 el={heading}>Settings</h2>
		</div>
	</main>
}`,
	);

	expect(graph.diagnostics).toEqual([]);
	expect(graph.overlays).toEqual([{ hostNodeId: 'h1', componentName: 'App', order: 0 }]);
	expect(
		graph.elementHandleIdrefs.map((idref) => [idref.hostNodeId, idref.boundHostNodeId]),
	).toEqual([['h1', 'h2']]);
	expect(statics(graph)).not.toContain('overlay');
	expect(statics(graph)).not.toContain('aria-labelledby');
});

test('a multi-value IDREF is refused rather than silently joined', async () => {
	// v1 is one handle per IDREF position. A space-separated list would make the
	// compiler mint and order several ids, which is the id spelling this record
	// deliberately does not own.
	const source = `import { element } from '@markless/core';
export function App() @{
	const first = element<HTMLSpanElement>();
	const second = element<HTMLSpanElement>();
	<div>
		<span el={first}>A</span>
		<span el={second}>B</span>
		<p aria-labelledby={[first, second]}>Body</p>
	</div>
}`;
	const graph = await graphOf('MultiIdref', source);
	const valueStart = source.indexOf('[first, second]');

	expect(graph.elementHandleIdrefs).toEqual([]);
	expect(codes(graph)).toEqual(['MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE']);
	expect(graph.diagnostics[0]).toEqual(
		expect.objectContaining({
			code: 'MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE',
			severity: 'error',
			title: 'One element() handle per IDREF attribute',
			primarySpan: {
				filename: 'src/MultiIdref.tsrx',
				start: valueStart,
				end: valueStart + '[first, second]'.length,
			},
			docsUrl: 'https://markless.dev/errors/MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE',
		}),
	);
});

test('a handle joined into a string in an IDREF position is refused too', async () => {
	const graph = await graphOf(
		'JoinedIdref',
		`import { element } from '@markless/core';
export function App() @{
	const first = element<HTMLSpanElement>();
	<div>
		<span el={first}>A</span>
		<p aria-describedby={\`\${first} static-id\`}>Body</p>
	</div>
}`,
	);

	expect(graph.elementHandleIdrefs).toEqual([]);
	expect(codes(graph)).toEqual(['MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE']);
});

test('a choice between two handles in an IDREF position is refused too', async () => {
	// Same refusal, same reason: the value mentions handles without being one.
	// Falling through would write a DOM element into a string attribute.
	const graph = await graphOf(
		'ChoiceIdref',
		`import { element, state } from '@markless/core';
export function App() @{
	const first = element<HTMLSpanElement>();
	const second = element<HTMLSpanElement>();
	const flipped = state(false);
	<div>
		<span el={first}>A</span>
		<span el={second}>B</span>
		<p aria-labelledby={flipped ? first : second}>Body</p>
	</div>
}`,
	);

	expect(graph.elementHandleIdrefs).toEqual([]);
	expect(codes(graph)).toEqual(['MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE']);
});

test('an array with no handle in it keeps its ordinary attribute diagnostic', async () => {
	const graph = await graphOf(
		'PlainArrayIdref',
		`export function App() @{
	<p aria-labelledby={['a', 'b']}>Body</p>
}`,
	);

	expect(codes(graph)).toEqual(['MARKLESS_ATTRIBUTE_OBJECT_VALUE']);
});

test('a row-owned handle in an IDREF position is refused', async () => {
	// One authored handle, N rows, N ids. Per-row identity is out of this slice,
	// so the ambiguity is refused instead of resolved.
	const graph = await graphOf(
		'RowIdref',
		`import { element, state } from '@markless/core';
export function App() @{
	const rows = state([{ id: 'a', label: 'A' }]);
	const row = element<HTMLLIElement>();
	<section>
		<div aria-controls={row}>Controls</div>
		<ul>@for (const item of rows; key item.id) { <li el={row}>{item.label}</li> }</ul>
	</section>
}`,
	);

	expect(graph.elementHandleIdrefs).toEqual([]);
	expect(codes(graph)).toEqual(
		expect.arrayContaining(['MARKLESS_ELEMENT_HANDLE_IDREF_ROW_OWNED']),
	);
	expect(
		graph.diagnostics.find(
			(diagnostic) => diagnostic.code === 'MARKLESS_ELEMENT_HANDLE_IDREF_ROW_OWNED',
		)?.severity,
	).toBe('error');
});

test('two references to one handle each record their own relationship', async () => {
	const graph = await graphOf(
		'SharedHandle',
		`import { element } from '@markless/core';
export function App() @{
	const label = element<HTMLSpanElement>();
	<div>
		<span el={label}>Notifications</span>
		<div aria-labelledby={label}>One</div>
		<div aria-describedby={label}>Two</div>
	</div>
}`,
	);

	expect(graph.diagnostics).toEqual([]);
	expect(
		graph.elementHandleIdrefs.map((idref) => [
			idref.attributeName,
			idref.hostNodeId,
			idref.boundHostNodeId,
			idref.order,
		]),
	).toEqual([
		['aria-labelledby', 'h2', 'h1', 0],
		['aria-describedby', 'h3', 'h1', 1],
	]);
});
