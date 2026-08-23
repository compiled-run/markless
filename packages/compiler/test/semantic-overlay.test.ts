import { expect, test } from 'vitest';
import { buildSemanticGraph } from '../src/index.ts';

// `overlay` is elevation only: it renders the host above the rest of the UI,
// escaping clipping and stacking ancestors. It carries no dismissal, focus,
// positioning, ARIA, or animation policy, and it is deliberately non-reactive -
// `@if` owns whether the element exists, `overlay` owns how it is stacked.

async function graphOf(name: string, source: string) {
	return await buildSemanticGraph({ filename: `src/${name}.tsrx`, source });
}

const statics = (graph: Awaited<ReturnType<typeof buildSemanticGraph>>) =>
	graph.markup.chunks.map((chunk) => chunk.statics.join('')).join('');

test('bare overlay records one SemanticOverlay on the host element', async () => {
	const graph = await graphOf(
		'BareOverlay',
		`export function App() @{
		<main><div overlay class="sheet">Menu</div></main>
	}`,
	);

	expect(graph.diagnostics).toEqual([]);
	expect(graph.overlays).toEqual([{ hostNodeId: 'h1', componentName: 'App', order: 0 }]);
	expect(graph.hostNodes.find((host) => host.id === 'h1')?.tagName).toBe('div');
});

test('overlay={true} records the same overlay as the bare form', async () => {
	const graph = await graphOf(
		'ExplicitTrue',
		`export function App() @{
		<main><div overlay={true} class="sheet">Menu</div></main>
	}`,
	);

	expect(graph.diagnostics).toEqual([]);
	expect(graph.overlays).toEqual([{ hostNodeId: 'h1', componentName: 'App', order: 0 }]);
});

test('overlay={false} records no overlay and no diagnostic', async () => {
	const graph = await graphOf(
		'ExplicitFalse',
		`export function App() @{
		<main><div overlay={false} class="sheet">Menu</div></main>
	}`,
	);

	expect(graph.diagnostics).toEqual([]);
	expect(graph.overlays).toEqual([]);
});

test('a non-literal overlay is refused with MARKLESS_OVERLAY_VALUE_UNSUPPORTED', async () => {
	// The diagnostic IS the feature. Without it the value falls through to the
	// generic attribute branch and silently becomes a real DOM attribute binding.
	const source = `import { state } from '@markless/core';
export function App() @{
	const isOpen = state(true);
	<main><div overlay={isOpen}>Menu</div></main>
}`;
	const graph = await graphOf('ReactiveOverlay', source);
	const valueStart = source.indexOf('isOpen}>');

	expect(graph.overlays).toEqual([]);
	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_OVERLAY_VALUE_UNSUPPORTED',
			severity: 'error',
			phase: 'semantic-graph',
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
			title: 'overlay accepts only a literal',
			message:
				'Cannot bind overlay={isOpen}. overlay must be written on the element itself as bare `overlay`, `overlay={true}`, or `overlay={false}`.',
			primarySpan: {
				filename: 'src/ReactiveOverlay.tsrx',
				start: valueStart,
				end: valueStart + 'isOpen'.length,
			},
			docsUrl: 'https://markless.dev/errors/MARKLESS_OVERLAY_VALUE_UNSUPPORTED',
		}),
	]);
});

test('a non-boolean literal overlay is refused too', async () => {
	const graph = await graphOf(
		'StringOverlay',
		`export function App() @{
		<main><div overlay="yes">Menu</div></main>
	}`,
	);

	expect(graph.overlays).toEqual([]);
	expect(graph.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
		'MARKLESS_OVERLAY_VALUE_UNSUPPORTED',
	]);
});

test('overlay on a component element is refused with MARKLESS_OVERLAY_HOST_ELEMENT_REQUIRED', async () => {
	// overlay cannot be prop-forwarded, because a forwarded value is non-literal
	// by design. Accepting it on a component would be useless but silent.
	const graph = await graphOf(
		'ComponentOverlay',
		`export function App() @{
		<main><Dialog overlay>Menu</Dialog></main>
	}`,
	);

	expect(graph.overlays).toEqual([]);
	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_OVERLAY_HOST_ELEMENT_REQUIRED',
			severity: 'error',
			phase: 'semantic-graph',
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
			title: 'overlay can only be marked on host elements',
			message:
				'Cannot mark overlay on component <Dialog>. overlay elevates one concrete host element above the rest of the UI and needs a host element owner.',
			docsUrl: 'https://markless.dev/errors/MARKLESS_OVERLAY_HOST_ELEMENT_REQUIRED',
		}),
	]);
});

test('overlay inside an @if arm records against the arm host element', async () => {
	// Elevation is structural, so it is recorded once for the arm element rather
	// than being driven by the branch test.
	const graph = await graphOf(
		'BranchedOverlay',
		`import { state } from '@markless/core';
export function App() @{
	const open = state(true);
	<main>@if (open) { <div overlay>Menu</div> }</main>
}`,
	);

	expect(graph.diagnostics).toEqual([]);
	expect(graph.overlays).toEqual([{ hostNodeId: 'h1', componentName: 'App', order: 0 }]);
});

test('overlay and el coexist on one element', async () => {
	const graph = await graphOf(
		'OverlayWithHandle',
		`import { element } from '@markless/core';
export function App() @{
	let sheet = element<HTMLDivElement>();
	<main><div overlay el={sheet}>Menu</div></main>
}`,
	);

	expect(graph.diagnostics).toEqual([]);
	expect(graph.overlays).toEqual([{ hostNodeId: 'h1', componentName: 'App', order: 0 }]);
	expect(graph.elementHandleBindings.map((binding) => binding.handleName)).toEqual(['sheet']);
});

test('overlay inside a keyed repeat carries keyedRepeatScopeIds', async () => {
	// No diagnostic: overlay carries no authored name, so N rows produce N
	// elevated hosts unambiguously.
	const graph = await graphOf(
		'RepeatedOverlay',
		`import { state } from '@markless/core';
export function App() @{
	const rows = state([]);
	<main>@for (const row of rows; key row.id) { <div overlay>{row.label}</div> }</main>
}`,
	);

	expect(graph.diagnostics).toEqual([]);
	expect(graph.overlays).toEqual([
		{
			hostNodeId: 'h1',
			componentName: 'App',
			order: 0,
			keyedRepeatScopeIds: ['repeat:0'],
		},
	]);
});

test('a spread cannot carry overlay', async () => {
	const graph = await graphOf(
		'SpreadOverlay',
		`export function App() @{
		const attrs = { overlay: true, id: 'sheet' };
		<main><div {...attrs}>Menu</div></main>
	}`,
	);

	expect(graph.overlays).toEqual([]);
	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_OVERLAY_VALUE_UNSUPPORTED',
			severity: 'error',
			message:
				'Cannot carry overlay through {...attrs}. overlay must be written on the element itself as bare `overlay`, `overlay={true}`, or `overlay={false}`.',
		}),
	]);
});

test('overlay lowers to one normalized valueless attribute, never the authored spelling', async () => {
	// The authored word is the emitted word, because elevation is CSS the consumer
	// writes against `[overlay]` and the behaviour module reads stack membership
	// off the element. What must never happen is staticAttributeValue's own
	// rendering of whatever was authored: ` overlay="true"` for the `={true}`
	// spelling, or an attribute at all for `={false}`.
	for (const [name, mark, expected] of [
		['LeakBare', 'overlay', '<div overlay="" class="sheet">Menu</div>'],
		['LeakTrue', 'overlay={true}', '<div overlay="" class="sheet">Menu</div>'],
		['LeakFalse', 'overlay={false}', '<div class="sheet">Menu</div>'],
	] as const) {
		const graph = await graphOf(
			name,
			`export function App() @{
			<main><div ${mark} class="sheet">Menu</div></main>
		}`,
		);

		expect(statics(graph)).not.toContain('overlay="true"');
		expect(statics(graph)).toContain(expected);
	}
});

test('the overlay record has no inputs field', async () => {
	// Structural, not conventional: no inputs means no dependencies, which means
	// the record can never re-run. Adaptive elevation is a recorded non-goal.
	const graph = await graphOf(
		'NoInputs',
		`export function App() @{
		<main><div overlay>Menu</div></main>
	}`,
	);

	const overlay = graph.overlays[0];
	expect(overlay).toBeDefined();
	expect(Object.keys(overlay!).sort()).toEqual(['componentName', 'hostNodeId', 'order']);
	expect(Object.keys(overlay!)).not.toContain('inputs');
});

test('overlay marks are numbered in document order', async () => {
	const graph = await graphOf(
		'OrderedOverlays',
		`export function App() @{
		<main><div overlay>First</div><span>plain</span><div overlay={true}>Second</div></main>
	}`,
	);

	expect(graph.diagnostics).toEqual([]);
	expect(graph.overlays.map((overlay) => [overlay.hostNodeId, overlay.order])).toEqual([
		['h1', 0],
		['h3', 1],
	]);
});

test('duplicate overlay attributes still report MARKLESS_ATTRIBUTE_DUPLICATE', async () => {
	// overlay is deliberately absent from the duplicate-attribute skip list.
	const graph = await graphOf(
		'DuplicateOverlay',
		`export function App() @{
		<main><div overlay overlay>Menu</div></main>
	}`,
	);

	expect(graph.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
		'MARKLESS_ATTRIBUTE_DUPLICATE',
	]);
	// Both marks are still recorded; the duplicate diagnostic is what gates the
	// compile, not a silent drop of one of them.
	expect(graph.overlays.map((overlay) => overlay.order)).toEqual([0, 1]);
});
