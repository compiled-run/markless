import { expect, test } from 'vitest';
import { buildSemanticGraph } from '../src/index.ts';

const moduleScopeSource = `
import { state, computed } from '@markless/core';

const leaked = state(0);
export const doubled = computed(() => leaked * 2);

export function App() @{
	<p>ok</p>
}
`;

const missingFrameworkImportSource = `
export function Counter() @{
	let count = state(0);
	let double = computed(() => count * 2);
	let input = element<HTMLInputElement>();

	<button onClick={() => count++}>{count} / {double}</button>
}
`;

const asyncPostAwaitReadSource = `
import { state, computed } from '@markless/core';

export function UserRoute(route: { params: { userId: string } }) @{
	const settings = state({ locale: 'en' });
	const user = computed(async ({ signal }) => {
		const id = route.params.userId;
		const response = await fetch('/api/users/' + id, { signal });
		return formatUser(response, settings.locale);
	});

	@try {
		<p>{user.name}</p>
	} @pending {
		<p>Loading</p>
	} @catch (error) {
		<p>{error.message}</p>
	}
}
`;

const missingAsyncBoundarySource = `
import { computed } from '@markless/core';

export function UserRoute() @{
	const user = computed(async ({ signal }) => {
		const response = await fetch('/api/user', { signal });
		return await response.json();
	});

	<p>{user.name}</p>
}
`;

const transitiveAsyncBoundarySource = `
import { computed } from '@markless/core';

export function UserRoute() @{
	const user = computed(async ({ signal }) => {
		const response = await fetch('/api/user', { signal });
		return await response.json();
	});
	const userName = computed(() => user.name.toUpperCase());

	<p>{userName}</p>
}
`;

const elementHandleDiagnosticsSource = `
import { state, element } from '@markless/core';

export function Handles() @{
	const menu = state({ open: false });
	let input = element<HTMLInputElement>();

	<section>
		<input el={menu} />
		<button el={input}>One</button>
		<button el={input}>Two</button>
	</section>
}
`;

const elementHandleInStateSource = `
import { state, element } from '@markless/core';

export function Handles() @{
	let input = element<HTMLInputElement>();
	const saved = state(input);

	<input el={input} />
}
`;

const templateAsValueSource = `import { state, computed } from '@markless/core'; export function App() @{ const banner = <h1>Hi</h1>; const rows = []; rows.push(<li>One</li>); const view = state(<p>Stored</p>); const card = computed(() => <article>Card</article>); const tiles = [<span>Tile</span>]; <section>{banner}{rows}{view}{card}{tiles}</section> }`;

const componentAttachSource = `
import { state } from '@markless/core';

function ChartWrapper() @{
	<canvas />
}

export function Dashboard() @{
	const config = state({ color: 'red' });

	<section>
		<ChartWrapper attach={chart(config)} />
	</section>
}
`;

const unextractableSyncPolicySource = `
import { state } from '@markless/core';

export function Form() @{
	const allowSubmit = state(false);

	<form>
		<button
			onClick={(event) => {
				if (canSubmit(allowSubmit, event)) {
					event.preventDefault();
				}
			}}
		>
			Save
		</button>
	</form>
}
`;

const detachedSyncPolicySource = `import { state } from '@markless/core'; export function Link() @{ let count = state(0); <a href="/next" onClick={(event) => { const pd = event.preventDefault; pd(); count++; }}>Next {count}</a> }`;
const eventExpressionSource = `import { state } from '@markless/core'; export function Counter() @{ let count = state(0); <button onClick={count++}>{count}</button> }`;

const graphDestructureDefaultSource = `
import { state } from '@markless/core';

export function Menu() @{
	const menu = state({ title: undefined });
	const { title: menuTitle = "Untitled" } = menu;

	<p>{menuTitle}</p>
}
`;

const templateWriteSource = `
import { state } from '@markless/core';

export function Counter() @{
	let count = state(0);

	<p>{count++}</p>
}
`;

const computedWriteSource = `
import { state, computed } from '@markless/core';

export function Counter() @{
	let count = state(1);
	const doubled = computed(() => {
		count++;
		return count * 2;
	});

	<p>{doubled}</p>
}
`;

const sharedCycleSource = `
import { shared } from '@markless/core';

export const session = shared(() => {
	const c = cart();
	return { c };
});

export const cart = shared(() => {
	const s = session();
	return { s };
});

export function App() @{
	<p>ok</p>
}
`;

test('buildSemanticGraph reports module-scope graph state creation', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/ModuleScope.tsrx',
		source: moduleScopeSource,
	});
	const stateStart = moduleScopeSource.indexOf('state(0)');
	const computedStart = moduleScopeSource.indexOf('computed(() => leaked * 2)');

	expect(graph.components).toEqual([{ name: 'App' }]);
	expect(graph.graphBindings).toEqual([]);
	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_STATE_MODULE_SCOPE',
			severity: 'error',
			phase: 'semantic-graph',
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
			title: 'state() and computed() cannot be created at module scope',
			message: 'Cannot create "leaked" with state() at module scope.',
			why: 'Module-scope graph state would be shared across requests and has no per-document serialization payload.',
			primarySpan: {
				filename: 'src/ModuleScope.tsrx',
				start: stateStart,
				end: stateStart + 'state(0)'.length,
			},
			suggestions: [
				{
					message:
						'Move state() or computed() creation into a component or declare request/container/page state with shared().',
				},
			],
			docsUrl: 'https://markless.dev/errors/MARKLESS_STATE_MODULE_SCOPE',
		}),
		expect.objectContaining({
			code: 'MARKLESS_STATE_MODULE_SCOPE',
			severity: 'error',
			phase: 'semantic-graph',
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
			title: 'state() and computed() cannot be created at module scope',
			message: 'Cannot create "doubled" with computed() at module scope.',
			primarySpan: {
				filename: 'src/ModuleScope.tsrx',
				start: computedStart,
				end: computedStart + 'computed(() => leaked * 2)'.length,
			},
			docsUrl: 'https://markless.dev/errors/MARKLESS_STATE_MODULE_SCOPE',
		}),
	]);
});

test('buildSemanticGraph reports shared definition dependency cycles', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/shared-cycle.tsrx',
		source: sharedCycleSource,
	});
	const cycleStart = sharedCycleSource.indexOf('session();');

	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_SHARED_DEFINITION_CYCLE',
			severity: 'error',
			phase: 'semantic-graph',
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
			title: 'Shared definitions cannot depend on each other circularly',
			message: 'Cannot create shared definition cycle "session -> cart -> session".',
			why: 'shared() instances are created from graph context during initial render and resume. A cycle would require one shared instance before its own dependency graph can be created.',
			primarySpan: {
				filename: 'src/shared-cycle.tsrx',
				start: cycleStart,
				end: cycleStart + 'session()'.length,
			},
			docsUrl: 'https://markless.dev/errors/MARKLESS_SHARED_DEFINITION_CYCLE',
		}),
	]);
});

test('buildSemanticGraph reports missing framework API imports', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/Counter.tsrx',
		source: missingFrameworkImportSource,
	});
	const stateStart = missingFrameworkImportSource.indexOf('state(0)');
	const computedStart = missingFrameworkImportSource.indexOf('computed(() => count * 2)');
	const elementStart = missingFrameworkImportSource.indexOf('element<HTMLInputElement>()');

	expect(graph.graphBindings).toEqual([]);
	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_FRAMEWORK_IMPORT_REQUIRED',
			severity: 'error',
			phase: 'semantic-graph',
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
			title: 'Framework API must be imported',
			message: 'Cannot use state() until it is imported from markless.',
			why: 'state() is a compiler-rewritten markless API. The import makes ownership explicit for TypeScript, editors, junior developers, and AI agents.',
			primarySpan: {
				filename: 'src/Counter.tsrx',
				start: stateStart,
				end: stateStart + 'state(0)'.length,
			},
			suggestions: [
				{
					message: "Add `import { state } from '@markless/core';` to this .tsrx file.",
				},
			],
			docsUrl: 'https://markless.dev/errors/MARKLESS_FRAMEWORK_IMPORT_REQUIRED',
		}),
		expect.objectContaining({
			code: 'MARKLESS_FRAMEWORK_IMPORT_REQUIRED',
			message: 'Cannot use computed() until it is imported from markless.',
			primarySpan: {
				filename: 'src/Counter.tsrx',
				start: computedStart,
				end: computedStart + 'computed(() => count * 2)'.length,
			},
			suggestions: [
				{
					message: "Add `import { computed } from '@markless/core';` to this .tsrx file.",
				},
			],
		}),
		expect.objectContaining({
			code: 'MARKLESS_FRAMEWORK_IMPORT_REQUIRED',
			message: 'Cannot use element() until it is imported from markless.',
			primarySpan: {
				filename: 'src/Counter.tsrx',
				start: elementStart,
				end: elementStart + 'element<HTMLInputElement>()'.length,
			},
			suggestions: [
				{
					message: "Add `import { element } from '@markless/core';` to this .tsrx file.",
				},
			],
		}),
	]);
});

test('B915 reports framework API misuse at the semantic graph site', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/FrameworkApiMisuse.tsrx',
		source: `import { state, computed } from '@markless/core'; export function App() @{ let count = state(1); const nestedState = state(state(5)); const nestedComputed = computed(() => computed(() => count)); const self = computed(() => self ? 1 : 2); const makeState = state; let hidden = makeState(5); <p>{count} {nestedState} {nestedComputed} {self} {hidden}</p> }`,
	});

	expect(graph.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				code: 'MARKLESS_STATE_NESTED_CREATION',
				title: 'state() cannot be the initial value of another state()',
				message:
					'`state(state(5))` declares graph state whose initial value is another state() call. `nestedState` cannot store graph state as its value.',
			}),
			expect.objectContaining({
				code: 'MARKLESS_STATE_NESTED_CREATION',
				title: 'A framework API call cannot be a graph value',
				message:
					'`computed(() => computed(() => count))` creates a computed whose value would be another computed() call. `nestedComputed` derives a value; it cannot derive graph nodes.',
			}),
			expect.objectContaining({
				code: 'MARKLESS_COMPUTED_DEPENDENCY_CYCLE',
				title: 'A computed cannot depend on itself',
				message:
					'`computed(() => self ? 1 : 2)` reads `self` — the value it is defining. `self` cannot be derived from `self`.',
			}),
			expect.objectContaining({
				code: 'MARKLESS_FRAMEWORK_API_ALIAS_UNSUPPORTED',
				title: 'Framework APIs cannot be aliased or passed as values',
				message:
					'`const makeState = state` copies the framework API `state` into a plain variable. `makeState(5)` would not create graph state — the compiler only rewrites calls made through the imported name.',
			}),
		]),
	);
	expect(graph.graphBindings.map((binding) => binding.name)).toEqual(['count']);
});

test('B915 reports local framework API shadowing without import-only guidance', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/ShadowedState.tsrx',
		source: `function state(value) { return value * 2; } export function App() @{ const x = state(5); <p>{x}</p> }`,
	});

	expect(graph.graphBindings).toEqual([]);
	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_FRAMEWORK_IMPORT_REQUIRED',
			message:
				'`state(5)` calls your local function `state`, but in `.tsrx` files `state` is a compiler-recognized markless API name. Rename the local function, or import the framework API from `@markless/core`.',
			suggestions: [
				{
					message:
						'Rename the helper (before: `function state(value) { ... }` — after: `function doubleValue(value) { ... }`), or, if graph state was intended, delete the helper and add `import { state } from \'@markless/core\';`.',
				},
			],
		}),
	]);
	expect(graph.graphBindings.map((binding) => binding.id)).not.toContain('prop:value');
});

test('buildSemanticGraph reports state writes inside template expressions', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/TemplateWrite.tsrx',
		source: templateWriteSource,
	});
	const writeStart = templateWriteSource.indexOf('count++');

	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_STATE_WRITE_IN_TEMPLATE',
			severity: 'error',
			phase: 'semantic-graph',
			title: 'Cannot write state inside a template expression',
			message:
				'`count++` writes to `count` while rendering its value. A template expression is a DOM read; writing `count` there would re-trigger the same DOM update that is rendering it.',
			why: 'DOM updates are the only effects in the demand-driven graph; a write inside a DOM read creates a self-waking cycle that cannot resume.',
			primarySpan: {
				filename: 'src/TemplateWrite.tsrx',
				start: writeStart,
				end: writeStart + 'count'.length,
			},
			statePath: 'count',
			source: 'count++',
			docsUrl: 'https://markless.dev/errors/MARKLESS_STATE_WRITE_IN_TEMPLATE',
		}),
	]);
});

test('buildSemanticGraph reports assignment writes inside branch conditions', async () => {
	const source = `import { state } from '@markless/core'; export function App() @{ let open = state(false); <section>@if (open = true) { <p>Always?</p> }</section> }`;
	const graph = await buildSemanticGraph({
		filename: 'src/BranchAssignment.tsrx',
		source,
	});
	const writeStart = source.indexOf('open = true');

	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_STATE_WRITE_IN_TEMPLATE',
			severity: 'error',
			phase: 'semantic-graph',
			title: 'Cannot write state inside a template expression',
			message:
				'`@if (open = true)` assigns to `open` while deciding which branch to render. A branch test is a read; writing `open` there would re-trigger the very update that is evaluating it. If you meant a comparison, write `===`.',
			primarySpan: {
				filename: 'src/BranchAssignment.tsrx',
				start: writeStart,
				end: writeStart + 'open'.length,
			},
			statePath: 'open',
			source: '@if (open = true)',
			docsUrl: 'https://markless.dev/errors/MARKLESS_STATE_WRITE_IN_TEMPLATE',
		}),
	]);
});

test('buildSemanticGraph reports state writes inside computed derives', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/ComputedWrite.tsrx',
		source: computedWriteSource,
	});
	const writeStart = computedWriteSource.indexOf('count++');

	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_STATE_WRITE_IN_COMPUTED',
			severity: 'error',
			phase: 'semantic-graph',
			passId: 'tsrx-semantic-graph',
			title: 'A computed cannot write graph state',
			message:
				'`count++` writes to `count` while deriving a computed value. A computed is a graph read, so writing graph state there would re-trigger the same derivation.',
			why: 'A computed is a demand-driven read in the graph; the only effects in the system are compiler-generated DOM updates, so a write inside a derive is a self-waking cycle that cannot resume.',
			primarySpan: {
				filename: 'src/ComputedWrite.tsrx',
				start: writeStart,
				end: writeStart + 'count'.length,
			},
			statePath: 'count',
			source: 'count++',
			docsUrl: 'https://markless.dev/errors/MARKLESS_STATE_WRITE_IN_COMPUTED',
		}),
	]);
});

test('buildSemanticGraph reports unextractable synchronous event policy', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/Form.tsrx',
		source: unextractableSyncPolicySource,
	});
	const actionStart = unextractableSyncPolicySource.indexOf('event.preventDefault()');

	expect(graph.events).toEqual([
		expect.objectContaining({
			hasSyncPolicyCandidate: true,
			syncPolicy: undefined,
		}),
	]);
	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_SYNC_POLICY_UNEXTRACTABLE',
			severity: 'error',
			phase: 'sync-policy',
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
			title: 'Cannot extract synchronous event policy',
			message:
				'Cannot extract a synchronous preventDefault policy for onClick because the guard is not limited to graph state, event fields, props, and constants.',
			why: 'preventDefault() and stopPropagation() must run before lazy handler symbols load. The compiler can only emit a synchronous policy when the condition is fully represented in the resumable graph/event data plane.',
			primarySpan: {
				filename: 'src/Form.tsrx',
				start: actionStart,
				end: actionStart + 'event.preventDefault()'.length,
			},
			suggestions: [
				{
					message:
						'Move the browser-critical condition into graph state and simple event-field comparisons, or remove preventDefault()/stopPropagation() from the lazy handler.',
				},
			],
			docsUrl: 'https://markless.dev/errors/MARKLESS_SYNC_POLICY_UNEXTRACTABLE',
		}),
	]);
});

test('B914 reports detached sync policy references with the truthful reason', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/Link.tsrx',
		source: detachedSyncPolicySource,
	});
	const detachedStart = detachedSyncPolicySource.indexOf('pd = event.preventDefault');

	expect(graph.events).toEqual([
		expect.objectContaining({
			eventName: 'click',
			hasSyncPolicyCandidate: true,
			syncPolicy: undefined,
		}),
	]);
	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_SYNC_POLICY_UNEXTRACTABLE',
			phase: 'sync-policy',
			message:
				'`pd = event.preventDefault` detaches preventDefault from the event, so the compiler cannot prove when the default action is cancelled for onClick.',
			why: 'preventDefault() and stopPropagation() must run before lazy handler symbols load; a detached reference hides which action runs and under what condition.',
			primarySpan: expect.objectContaining({ start: detachedStart }),
		}),
	]);
});

test('B914 reports non-function event prop expressions', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/Counter.tsrx',
		source: eventExpressionSource,
	});
	const expressionStart = eventExpressionSource.indexOf('count++');

	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_EVENT_HANDLER_NOT_A_FUNCTION',
			phase: 'semantic-graph',
			title: 'Event props need a function',
			message:
				'`onClick={count++}` passes the result of `count++`, not a function. The expression would run once while rendering, and the click would receive a number.',
			why: 'An event prop compiles to a lazy handler symbol that runs on the browser event; only a function or an array of functions can be that handler.',
			primarySpan: expect.objectContaining({ start: expressionStart }),
		}),
	]);
});

test('buildSemanticGraph reports reactive reads after await in async computed bodies', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/UserRoute.tsrx',
		source: asyncPostAwaitReadSource,
	});
	const invalidReadStart = asyncPostAwaitReadSource.indexOf('settings.locale');

	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_ASYNC_POST_AWAIT_READ',
			severity: 'error',
			phase: 'semantic-graph',
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
			title: 'Reactive reads after await are not resumable',
			message:
				'Cannot read "settings.locale" after await in async computed "user". Snapshot the value before awaiting.',
			why: 'Async computed dependency keys are captured before the first await. Reading graph state after suspension would make revalidation and resume depend on hidden async timing.',
			primarySpan: {
				filename: 'src/UserRoute.tsrx',
				start: invalidReadStart,
				end: invalidReadStart + 'settings.locale'.length,
			},
			suggestions: [
				{
					message:
						'Read the graph value before the first await, or split post-await formatting into a separate sync computed().',
				},
			],
			docsUrl: 'https://markless.dev/errors/MARKLESS_ASYNC_POST_AWAIT_READ',
		}),
	]);
	expect(graph.diagnostics).not.toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				code: 'MARKLESS_ASYNC_POST_AWAIT_READ',
				message: expect.stringContaining('route.params.userId'),
			}),
		]),
	);
});

test('buildSemanticGraph reports async computed template reads outside async boundaries', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/MissingBoundary.tsrx',
		source: missingAsyncBoundarySource,
	});
	const invalidReadStart = missingAsyncBoundarySource.indexOf('user.name');

	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_ASYNC_BOUNDARY_REQUIRED',
			severity: 'error',
			phase: 'semantic-graph',
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
			title: 'Async computed reads need an async boundary',
			message:
				'Cannot read async computed "user.name" outside @try/@pending/@catch. Wrap the read in an async boundary.',
			why: 'Async computed values can be pending or rejected during initial render and resume. The runtime needs an explicit TSRX async boundary to render pending and error UI.',
			primarySpan: {
				filename: 'src/MissingBoundary.tsrx',
				start: invalidReadStart,
				end: invalidReadStart + 'user.name'.length,
			},
			suggestions: [
				{
					message:
						'Wrap this template read in @try with @pending and @catch branches, or read a sync computed that is already guarded by an async boundary.',
				},
			],
			docsUrl: 'https://markless.dev/errors/MARKLESS_ASYNC_BOUNDARY_REQUIRED',
		}),
	]);
});

test('buildSemanticGraph reports sync computed reads that transitively depend on async computeds', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/TransitiveBoundary.tsrx',
		source: transitiveAsyncBoundarySource,
	});
	const invalidReadStart = transitiveAsyncBoundarySource.indexOf('userName}</p>');

	expect(graph.graphBindings).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				name: 'userName',
				kind: 'computed',
				async: false,
				asyncCapable: true,
				dependencies: [
					{
						source: 'user.name',
						graphNodeId: 'computed:user',
						path: ['name'],
					},
				],
			}),
		]),
	);
	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_ASYNC_BOUNDARY_REQUIRED',
			severity: 'error',
			phase: 'semantic-graph',
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
			title: 'Async computed reads need an async boundary',
			message:
				'Cannot read async-capable computed "userName" outside @try/@pending/@catch. Wrap the read in an async boundary.',
			primarySpan: {
				filename: 'src/TransitiveBoundary.tsrx',
				start: invalidReadStart,
				end: invalidReadStart + 'userName'.length,
			},
			docsUrl: 'https://markless.dev/errors/MARKLESS_ASYNC_BOUNDARY_REQUIRED',
		}),
	]);
});

test('buildSemanticGraph reports invalid and duplicate element handle bindings', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/Handles.tsrx',
		source: elementHandleDiagnosticsSource,
	});
	const invalidHandleStart = elementHandleDiagnosticsSource.indexOf('menu} />');
	const duplicateHandleStart = elementHandleDiagnosticsSource.lastIndexOf('input}>Two');

	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_ELEMENT_HANDLE_REQUIRED',
			severity: 'error',
			phase: 'semantic-graph',
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
			title: 'el expects an element() handle',
			message: 'Cannot bind el={menu} because "menu" is state(), not an element() handle.',
			why: 'DOM elements are host resources. el can only bind element() handles so resume can recover the current DOM locator without serializing a DOM node.',
			primarySpan: {
				filename: 'src/Handles.tsrx',
				start: invalidHandleStart,
				end: invalidHandleStart + 'menu'.length,
			},
			elementLocator: 'h1',
			suggestions: [
				{
					message:
						'Create a handle with element<T>() and bind that handle with el={handle}. Keep DOM-backed resources in attach={...}.',
				},
			],
			docsUrl: 'https://markless.dev/errors/MARKLESS_ELEMENT_HANDLE_REQUIRED',
		}),
		expect.objectContaining({
			code: 'MARKLESS_ELEMENT_HANDLE_DUPLICATE',
			severity: 'error',
			phase: 'semantic-graph',
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
			title: 'element() handle is bound more than once',
			message: 'Cannot bind element handle "input" to multiple live host elements.',
			why: 'A resumed element handle must resolve to one current DOM locator. Binding one handle to multiple live elements would make lazy event code ambiguous.',
			primarySpan: {
				filename: 'src/Handles.tsrx',
				start: duplicateHandleStart,
				end: duplicateHandleStart + 'input'.length,
			},
			elementLocator: 'h3',
			suggestions: [
				{
					message:
						'Create a separate element() handle for each host element, or move repeated element access into keyed state and behavior records.',
				},
			],
			docsUrl: 'https://markless.dev/errors/MARKLESS_ELEMENT_HANDLE_DUPLICATE',
		}),
	]);
});

test('buildSemanticGraph reports element handles stored in state', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/Handles.tsrx',
		source: elementHandleInStateSource,
	});
	const handleStart = elementHandleInStateSource.indexOf('input);');

	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_STATE_ELEMENT_HANDLE_UNSERIALIZABLE',
			severity: 'error',
			phase: 'semantic-graph',
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
			title: 'element() handles cannot be stored in state',
			message:
				'Cannot store element handle "input" in state "saved" because element handles are DOM locators, not serializable graph data.',
			why: 'state() values are serialized into markless/state and resumed without running component bodies. An element() handle resolves through DOM locator metadata and must stay outside serialized graph state.',
			primarySpan: {
				filename: 'src/Handles.tsrx',
				start: handleStart,
				end: handleStart + 'input'.length,
			},
			statePath: 'saved',
			source: 'input',
			suggestions: [
				{
					message:
						'Keep element handles in element() bindings and bind them with el={handle}. Store serializable ids, flags, or data in state() instead.',
				},
			],
			docsUrl: 'https://markless.dev/errors/MARKLESS_STATE_ELEMENT_HANDLE_UNSERIALIZABLE',
		}),
	]);
});

test('buildSemanticGraph reports templates stored or passed as runtime values', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/TemplateAsValue.tsrx',
		source: templateAsValueSource,
	});

	const diagnostics = graph.diagnostics.filter(
		(diagnostic) => diagnostic.code === 'MARKLESS_TEMPLATE_AS_VALUE',
	);
	expect(diagnostics).toHaveLength(5);
	expect(diagnostics[0]).toEqual(
		expect.objectContaining({
			severity: 'error',
			phase: 'semantic-graph',
			title: 'A template is not a value',
			message: expect.stringContaining('banner'),
			why: expect.stringContaining('no VDOM'),
			suggestions: [expect.objectContaining({ message: expect.stringContaining('@if/@for') })],
			docsUrl: 'https://markless.dev/errors/MARKLESS_TEMPLATE_AS_VALUE',
		}),
	);
	expect(diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
		expect.stringContaining('banner'),
		expect.stringContaining('rows.push(<li>One</li>)'),
		expect.stringContaining('state(<p>Stored</p>)'),
		expect.stringContaining('computed(() => <article>Card</article>)'),
		expect.stringContaining('tiles'),
	]);
	expect(graph.hostNodes.map((host) => host.tagName)).toEqual(['section']);
	expect(graph.graphBindings.map((binding) => binding.id)).not.toContain('state:view');
	expect(graph.graphBindings.map((binding) => binding.id)).not.toContain('computed:card');
});

test('buildSemanticGraph keeps legal template structure positions valid', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/LegalTemplateStructure.tsrx',
		source: `import { state } from '@markless/core'; import { Link } from '@markless/core/router'; export function App() @{ const open = state(true); <main>@if (open) { <h1>Open</h1> } @else { <h1>Closed</h1> }<Link><strong>Projected</strong></Link></main> }`,
	});
	expect(graph.diagnostics).toEqual([]);
});

test('buildSemanticGraph reports attach on components instead of treating it as a host behavior', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/Dashboard.tsrx',
		source: componentAttachSource,
	});
	const behaviorStart = componentAttachSource.indexOf('chart(config)');

	expect(graph.behaviors).toEqual([]);
	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_ATTACH_HOST_ELEMENT_REQUIRED',
			severity: 'error',
			phase: 'semantic-graph',
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
			title: 'attach can only be bound to host elements',
			message:
				'Cannot bind attach={chart(config)} on component <ChartWrapper>. attach installs DOM behavior and needs a concrete host element owner.',
			why: 'Element behaviors are resumed by locating the owning DOM element. A component is not a DOM locator and may render zero, one, or many host nodes.',
			primarySpan: {
				filename: 'src/Dashboard.tsrx',
				start: behaviorStart,
				end: behaviorStart + 'chart(config)'.length,
			},
			suggestions: [
				{
					message:
						'Move attach={...} to a host element such as <canvas>, or make the component forward behavior to a known host element in its own TSRX body.',
				},
			],
			docsUrl: 'https://markless.dev/errors/MARKLESS_ATTACH_HOST_ELEMENT_REQUIRED',
		}),
	]);
});

test('buildSemanticGraph reports graph destructuring defaults as unsupported aliases', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/Menu.tsrx',
		source: graphDestructureDefaultSource,
	});
	const defaultStart = graphDestructureDefaultSource.indexOf('menuTitle = "Untitled"');

	expect(graph.aliases).toEqual([]);
	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_STATE_DESTRUCTURE_DEFAULT_UNSUPPORTED',
			severity: 'error',
			phase: 'semantic-graph',
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
			title: 'Graph destructuring defaults are not supported yet',
			message:
				'Cannot create graph alias "menuTitle" from "menu.title" with a default value.',
			why: 'A destructuring default must run only when the property value is undefined. The current graph alias artifact can represent a graph path, but not a fallback expression without changing JavaScript semantics.',
			primarySpan: {
				filename: 'src/Menu.tsrx',
				start: defaultStart,
				end: defaultStart + 'menuTitle = "Untitled"'.length,
			},
			statePath: 'menu.title',
			source: 'menuTitle = "Untitled"',
			docsUrl: 'https://markless.dev/errors/MARKLESS_STATE_DESTRUCTURE_DEFAULT_UNSUPPORTED',
		}),
	]);
});
