import { describe, expect, it } from 'vitest';
import type { SemanticGraphArtifact } from '../src/index.ts';
import { createNativeViewPayload, NATIVE_FACT_COLLECTORS, type NativeViewOptions } from '../src/native.ts';
import { buildSemanticGraph } from '../src/passes/semantic-graph/index.ts';

const analyze = (filename: string, source: string) =>
	buildSemanticGraph({ filename, source, nativeFacts: NATIVE_FACT_COLLECTORS });

const nativeView = async (source: string, options: NativeViewOptions = {}) =>
	createNativeViewPayload(await analyze('src/App.tsrx', source), {
		readSource: (file) => (file === 'src/App.tsrx' ? source : undefined),
		...options,
	});

/** The build with other modules: `files` by name, resolved from `./name`. */
const withModules = async (source: string, files: Record<string, string>) => {
	const graphs = new Map<string, SemanticGraphArtifact>();
	for (const [name, text] of Object.entries(files)) graphs.set(`src/${name}`, await analyze(`src/${name}`, text));
	return createNativeViewPayload(await analyze('src/App.tsrx', source), {
		modules: { graphs, resolve: (specifier) => `src/${specifier.replace('./', '')}` },
	});
};

const texts = (payload: { nodes: ReadonlyArray<unknown> } | null) =>
	(payload?.nodes ?? []).flatMap((node) => {
		const text = node as { kind: string; id: string; parts?: unknown[] };
		return text.kind === 'text' ? [[text.id, text.parts] as const] : [];
	});

describe('values that are not component state', () => {
	it('reads module constants, their fields, destructured names and items of a list over them', async () => {
		const { payload, diagnostics } = await nativeView(`const TITLE = 'Plans';
const PLANS = [{ id: 'a', name: 'Basic' }, { id: 'b', name: 'Pro' }];
const [FIRST] = PLANS;
const { name: SECOND } = PLANS[1];
export function App() @{
	<main>
		<h1>{TITLE}</h1>
		<p>{FIRST.name}</p>
		<p>{SECOND}</p>
		@for (const plan of PLANS; key plan.id) {
			<p>{plan.name}</p>
		}
	</main>
}`);
		expect(diagnostics).toEqual([]);
		expect(texts(payload).slice(0, 3)).toEqual([
			['h1:text0', [{ expr: { literal: 'Plans' } }]],
			['h2:text0', [{ expr: { literal: 'Basic' } }]],
			['h3:text0', [{ expr: { literal: 'Pro' } }]],
		]);
		const list = payload?.nodes.find((node) => node.kind === 'repeat');
		expect(list).toMatchObject({
			list: {
				array: [
					{ spread: false, value: { object: [['id', { literal: 'a' }], ['name', { literal: 'Basic' }]] } },
					{ spread: false, value: { object: [['id', { literal: 'b' }], ['name', { literal: 'Pro' }]] } },
				],
			},
		});
	});

	it('follows an imported constant and a JSON default export, and indexes data by a fixed key at build time', async () => {
		const { payload, diagnostics } = await withModules(
			`import { LABELS } from './labels.ts';
import data from './data.ts';
export function App({ id = 'b' }: { id?: string }) @{
	const entry = data.byId[id];
	<main><p>{LABELS.title}</p><p>{entry.label}</p></main>
}`,
			{
				'labels.ts': `export const LABELS = { title: 'Hello' };`,
				'data.ts': `const json = { byId: { a: { label: 'A' }, b: { label: 'Bee' } } };\nexport default json;\n`,
			},
		);
		expect(diagnostics).toEqual([]);
		expect(texts(payload)).toEqual([
			['h1:text0', [{ expr: { literal: 'Hello' } }]],
			['h2:text0', [{ expr: { literal: 'Bee' } }]],
		]);
	});

	it('reads a record known at build time by a key that follows state, as the value of the key it equals', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
const LABELS: Record<string, string> = { on: 'Running', off: 'Stopped' };
export function App() @{
	let mode = state('off');
	<main><p>{LABELS[mode]}</p><button onClick={() => (mode = 'on')}>Start</button></main>
}`);
		expect(diagnostics).toEqual([]);
		const key = { call: 'String', arguments: [{ cell: 'state:mode' }] };
		expect(texts(payload)[0]?.[1]).toEqual([
			{
				expr: {
					if: { binary: '===', left: key, right: { literal: 'on' } },
					whenTrue: { literal: 'Running' },
					whenFalse: {
						if: { binary: '===', left: key, right: { literal: 'off' } },
						whenTrue: { literal: 'Stopped' },
						whenFalse: { literal: null },
					},
				},
			},
		]);
	});

	it('keeps a body const read alone in markup at the value the page rendered with, and follows it where the web re-derives it', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function App() @{
	let count = state(1);
	const doubled = count * 2;
	<main>
		<p>{doubled}</p>
		<p>{\`Now \${doubled}\`}</p>
		<button onClick={() => (count = doubled)}>Grow</button>
	</main>
}`);
		expect(diagnostics).toEqual([]);
		const doubled = { binary: '*', left: { cell: 'state:count' }, right: { literal: 2 } };
		expect(texts(payload).slice(0, 2)).toEqual([
			['h1:text0', [{ expr: { literal: 2 } }]],
			['h2:text0', [{ expr: { template: ['Now ', doubled, ''] } }]],
		]);
		expect(payload?.handlers[0]?.ops).toEqual([{ op: 'assign', cell: 'state:count', value: doubled }]);
	});

	it('names a value it cannot read, with where it is written when values are data only', async () => {
		const { diagnostics } = await nativeView(`import { state } from '@markless/core';
const PATTERN = /x/;
export function App() @{
	let text = state('a');
	<main><p>{PATTERN}</p></main>
}`, { scriptHandlers: 'never' });
		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0]).toMatchObject({
			message: expect.stringContaining('a text expression through `PATTERN` uses a regular expression'),
			primarySpan: { filename: 'src/App.tsrx' },
		});
	});
});

describe('the clock', () => {
	it('reads it once when the screen opens where the page renders it, and when a handler runs there', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function App() @{
	let pressedAt = state('never');
	const openedAt = new Date().toISOString();
	<main>
		<p>{openedAt}</p>
		<button onClick={() => (pressedAt = new Date().toISOString())}>{pressedAt}</button>
	</main>
}`);
		expect(diagnostics).toEqual([]);
		expect(payload?.cells).toContainEqual({ id: 'clock:open', name: 'Date.now()', initial: 0, clock: true });
		expect(texts(payload)[0]).toEqual([
			'h1:text0',
			[{ expr: { call: 'Date.toISOString', arguments: [{ cell: 'clock:open' }] } }],
		]);
		expect(payload?.handlers[0]?.ops).toEqual([
			{
				op: 'assign',
				cell: 'state:pressedAt',
				value: { call: 'Date.toISOString', arguments: [{ call: 'Date.now', arguments: [] }] },
			},
		]);
	});

	it('starts a state read from the clock at the clock when the screen opens', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function App() @{
	let now = state(Date.now());
	<main><button onClick={() => (now = Date.now())}>{now > 0 ? 'Ticking' : 'Stopped'}</button></main>
}`);
		expect(diagnostics).toEqual([]);
		expect(payload?.cells).toEqual([{ id: 'state:now', name: 'now', initial: 0, clock: true }]);
		expect(payload?.handlers[0]?.ops).toEqual([{ op: 'assign', cell: 'state:now', value: { call: 'Date.now', arguments: [] } }]);
	});

	it('refuses by name what formats a date in a time zone, and a date made from a value', async () => {
		const { diagnostics } = await nativeView(`export function App() @{
	<main><p>{new Date().toTimeString()}</p><p>{new Date(0).getTime()}</p><p>{new Date()}</p></main>
}`);
		expect(diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
			expect.stringContaining('calls `.toTimeString()` on a date, which depends on a time zone'),
			expect.stringContaining('makes a date from a value (`new Date(…)`)'),
			expect.stringContaining('a date used as a value'),
		]);
	});
});

describe('load-time events', () => {
	it('lowers idle and visible handlers as the events of their element', async () => {
		const { payload, diagnostics } = await nativeView(`import { state } from '@markless/core';
export function App() @{
	let seen = state(0);
	<main><p onIdle={() => seen++}>Idle</p><p onVisible={() => seen++}>{seen}</p></main>
}`);
		expect(diagnostics).toEqual([]);
		expect(payload?.events).toEqual([
			{ host: 'h1', event: 'idle', handler: 'handler:event:0' },
			{ host: 'h2', event: 'visible', handler: 'handler:event:1' },
		]);
	});
});

describe('links', () => {
	const routes = [
		{ pattern: '/', params: [] },
		{ pattern: '/about', params: [] },
		{ pattern: '/users/[id]', params: ['id'] },
	];
	// A stand-in for the router's matcher (`matchRouteManifest`), which ignores a trailing slash.
	const resolvePath = (path: string) => {
		const segments = path.split('/').filter(Boolean);
		if (segments.length === 0) return { pattern: '/', params: {} };
		if (segments.length === 1 && segments[0] === 'about') return { pattern: '/about', params: {} };
		if (segments.length === 2 && segments[0] === 'users') return { pattern: '/users/[id]', params: { id: segments[1]! } };
		return undefined;
	};

	it('matches a path with a trailing slash, or a filled-in path, as the router matches a URL', async () => {
		const { payload, diagnostics } = await nativeView(
			`import { Link } from '@markless/router';
export function App() @{
	<main><Link href="/about/">About</Link><Link href="/users/7">Seven</Link></main>
}`,
			{ routes, resolvePath },
		);
		expect(diagnostics).toEqual([]);
		expect(payload?.handlers.map((handler) => handler.ops)).toEqual([
			[{ op: 'navigate', route: '/about', params: {} }],
			[{ op: 'navigate', route: '/users/[id]', params: { id: '7' } }],
		]);
	});

	it('opens the route an awaited navigate() names, at the top of a handler or after a timer', async () => {
		const { payload, diagnostics } = await nativeView(
			`import { navigate } from '@markless/router';
export function App() @{
	<main>
		<button onClick={async () => { await navigate('/about'); }}>About</button>
		<button
			onClick={async () => {
				await new Promise((done) => setTimeout(done));
				await navigate('/users/7', { replace: true });
			}}
		>
			Seven
		</button>
	</main>
}`,
			{ routes, resolvePath },
		);
		expect(diagnostics.map((diagnostic) => diagnostic.message)).toEqual([]);
		expect(payload?.handlers.map((handler) => handler.ops)).toEqual([
			[{ op: 'navigate', route: '/about', params: {} }],
			[
				{
					op: 'after',
					ms: { literal: 0 },
					capture: [],
					ops: [{ op: 'navigate', route: '/users/[id]', params: { id: '7' }, replace: true }],
				},
			],
		]);
	});

	it('binds a link attribute that follows state, and opens the route an href built from a prop or a value names', async () => {
		const { payload, diagnostics } = await nativeView(
			`import { state as cell } from '@markless/core';
import { Link } from '@markless/router';
function Tab({ to, current, label }) @{
	<Link href={to} class={current ? 'tab on' : 'tab'} aria-current={current ? 'page' : undefined} data-tab="x">{label}</Link>
}
export function App() @{
	let user = cell('7');
	let on = cell(false);
	<main>
		<Tab to="/about" current={on} label="About" />
		<Link href={\`/users/\${user}\`}>User</Link>
		<button onClick={() => (on = !on)}>Flip</button>
	</main>
}`,
			{ routes, resolvePath },
		);
		expect(diagnostics.map((diagnostic) => diagnostic.message)).toEqual([]);
		const anchors = payload?.nodes.filter((node) => node.kind === 'element' && node.element === 'a');
		const current = { cell: 'state:on' };
		expect(anchors?.[0]).toMatchObject({
			attributes: { href: '/about', 'data-tab': 'x' },
			bindings: [
				{ attribute: 'class', value: { if: current, whenTrue: { literal: 'tab on' }, whenFalse: { literal: 'tab' } } },
				{ attribute: 'aria-current', value: { if: current, whenTrue: { literal: 'page' }, whenFalse: { literal: null } } },
			],
		});
		const userPath = { template: ['/users/', { cell: 'state:user' }, ''] };
		expect(anchors?.[1]).toMatchObject({ bindings: [{ attribute: 'href', value: userPath }] });
		expect(payload?.handlers.map((handler) => handler.ops)).toEqual([
			[{ op: 'navigate', route: '/about', params: {} }],
			[{ op: 'navigate', route: '/users/[id]', params: { id: { template: [{ cell: 'state:user' }] } } }],
			expect.anything(),
		]);
	});

	it('refuses an href built while rendering that a fixed route could also match, naming the routes', async () => {
		const { diagnostics } = await nativeView(
			`import { state } from '@markless/core';
import { Link } from '@markless/router';
export function App() @{
	let page = state('about');
	<main><Link href={\`/\${page}\`}>Go</Link></main>
}`,
			{ routes: [...routes, { pattern: '/[slug]', params: ['slug'] }], resolvePath },
		);
		expect(diagnostics.map((diagnostic) => diagnostic.message)).toContain(
			"a <Link> whose href is built while the page renders that could open /about or /[slug]; the web's router picks one only when it is followed",
		);
	});

	it("opens the app's not-found page for an in-app path no route matches, written, built or navigated to", async () => {
		const { payload, diagnostics } = await nativeView(
			`import { state } from '@markless/core';
import { Link, navigate } from '@markless/router';
export function App() @{
	let user = state('sam');
	<main>
		<Link href="/nowhere/">Lost</Link>
		<Link href={\`/logout/\${user}/now\`}>Out</Link>
		<button onClick={() => navigate('/settings')}>Settings</button>
	</main>
}`,
			{ routes, resolvePath, notFound: '/404' },
		);
		expect(diagnostics.map((diagnostic) => diagnostic.message)).toEqual([]);
		expect(payload?.handlers.map((handler) => handler.ops)).toEqual([
			[{ op: 'navigate', route: '/404', params: {} }],
			[{ op: 'navigate', route: '/404', params: {} }],
			[{ op: 'navigate', route: '/404', params: {} }],
		]);
	});

	it('leaves a link to another site alone with a not-found page', async () => {
		const { diagnostics } = await nativeView(
			`import { Link } from '@markless/router';
export function App() @{
	<main><Link href="//cdn.example/x">Away</Link></main>
}`,
			{ routes, resolvePath, notFound: '/404' },
		);
		expect(diagnostics.map((diagnostic) => diagnostic.message)).toContain(
			'a link to //cdn.example/x, which is not a route of this app',
		);
	});

	it('still refuses a path no route matches, where it is written', async () => {
		const { diagnostics } = await nativeView(
			`import { Link } from '@markless/router';
export function App() @{
	<main><Link href="/nowhere/">Lost</Link></main>
}`,
			{ routes, resolvePath },
		);
		expect(diagnostics.map((diagnostic) => [diagnostic.message, diagnostic.primarySpan !== undefined])).toContainEqual(
			['a link to /nowhere/, which is not a route of this app', true],
		);
	});
});
