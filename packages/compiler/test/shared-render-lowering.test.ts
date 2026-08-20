import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const pageSource = `
import { shared, state, computed } from '@markless/core';

export const session = shared(() => {
	const data = state({ user: null, status: 'anonymous' });
	const signedIn = computed(() => data.user !== null);

	return {
		...data,
		signedIn,
		login() {
			data.user = 'ada';
			data.status = 'ready';
		},
	};
});

export function App() @{
	const currentSession = session();

	<main>
		<output data-status>{currentSession.status}</output>
		<button onClick={() => currentSession.login()}>Login</button>
	</main>
}
`;

async function compile(filename: string, source: string) {
	return compileTsrxModule({
		filename,
		source,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
}

test('a shared definition ships as payload nodes and leaves no shared call in emitted source', async () => {
	const compiled = await compile('src/page.tsrx', pageSource);

	expect(compiled.protocolState.sharedDefinitions).toEqual([
		expect.objectContaining({
			id: 'shared:src/page.tsrx#session',
			name: 'session',
			graphNodeIds: [
				'shared:src/page.tsrx#session/state:data',
				'shared:src/page.tsrx#session/computed:signedIn',
			],
		}),
	]);
	expect(compiled.protocolState.cells.map((cell) => cell.graphNodeId)).toContain(
		'shared:src/page.tsrx#session/state:data',
	);

	const emitted = [
		compiled.publicRenderModule.moduleSource,
		compiled.publicRenderModule.ssrModuleSource,
		...compiled.symbolModules.modules.map((module) => module.source),
	].join('\n');
	expect(emitted).not.toMatch(/(^|[^\w$.])shared\s*\(/);
	expect(emitted).not.toMatch(/(^|[^\w$.])session\s*\(/);
	expect(emitted).not.toContain('currentSession');
});

test('a template read through a shared instance resolves to the factory graph node', async () => {
	const compiled = await compile('src/page.tsrx', pageSource);
	const template = compiled.renderData.chunks.find((chunk) => chunk.id === 'template:App');
	const slot = template?.slots.find((candidate) => candidate.kind === 'text');

	expect(slot && 'residue' in slot ? slot.residue : null).toEqual({
		kind: 'graph-read',
		graphNodeId: 'shared:src/page.tsrx#session/state:data',
		path: ['status'],
	});
});

test('a returned shared method called from a handler lowers to graph writes', async () => {
	const compiled = await compile('src/page.tsrx', pageSource);
	const handler = compiled.symbolModules.modules.find(
		(module) => module.kind === 'event-handler',
	);

	expect(handler?.source).toContain('"shared:src/page.tsrx#session/state:data"');
	expect(handler?.source).toContain(`path: ["user"]`);
	expect(handler?.source).toContain(`path: ["status"]`);
	expect(handler?.source).not.toContain('login');
});

test('two shared definitions in one module keep separate graph ids', async () => {
	const compiled = await compile(
		'src/two.tsrx',
		`
import { shared, state } from '@markless/core';

export const session = shared(() => {
	const data = state({ status: 'anonymous' });
	return { ...data };
});

export const theme = shared(() => {
	const data = state({ mode: 'light' });
	return { ...data };
}, { scope: 'page' });

export function App() @{
	const currentSession = session();
	const currentTheme = theme();

	<main>
		<output data-status>{currentSession.status}</output>
		<output data-mode>{currentTheme.mode}</output>
	</main>
}
`,
	);

	expect(
		(compiled.protocolState.sharedDefinitions ?? []).map((definition) => definition.id),
	).toEqual(['shared:src/two.tsrx#session', 'shared:src/two.tsrx#theme']);
	expect((compiled.protocolState.sharedDefinitions ?? [])[1]?.scope).toBe('page');
	expect(
		compiled.renderData.chunks
			.flatMap((chunk) => chunk.slots)
			.flatMap((slot) => ('residue' in slot && slot.residue.kind === 'graph-read'
				? [slot.residue.graphNodeId]
				: [])),
	).toEqual([
		'shared:src/two.tsrx#session/state:data',
		'shared:src/two.tsrx#theme/state:data',
	]);
});

test('an unsupported shared scope fails the compile closed', async () => {
	const compiled = await compile(
		'src/bad-scope.tsrx',
		`
import { shared, state } from '@markless/core';

export const session = shared(() => {
	const data = state({ status: 'anonymous' });
	return { ...data };
}, { scope: 'session' });

export function App() @{
	const currentSession = session();
	<output>{currentSession.status}</output>
}
`,
	);

	expect(
		compiled.semanticGraph.diagnostics.filter(
			(diagnostic) => diagnostic.severity === 'error',
		),
	).toEqual([
		expect.objectContaining({ code: 'MARKLESS_SHARED_SCOPE_INVALID' }),
	]);
});

const componentsPageSource = `
import { shared, state, computed } from '@markless/core';

export const session = shared(() => {
	const data = state({ user: 'none', status: 'anonymous' });
	const signedIn = computed(() => data.user !== 'none');

	return {
		...data,
		signedIn,
		login() {
			data.user = 'ada';
		},
	};
});

function Header() @{
	const header = session();

	<header>
		<output data-status>{header.status}</output>
		<output data-signed-in>{header.signedIn}</output>
	</header>
}

function Menu() @{
	const menu = session();

	<nav><output data-user>{menu.user}</output></nav>
}

export function App() @{
	const page = session();

	<main>
		<Header />
		<Menu />
		<button onClick={() => page.login()}>Login</button>
	</main>
}
`;

test('SSR seeds a shared node into every component that reads it', async () => {
	const compiled = await compile('src/components.tsrx', componentsPageSource);
	const ssr = compiled.publicRenderModule.ssrModuleSource;

	for (const name of ['Header', 'Menu']) {
		const seed = ssr.slice(ssr.indexOf(`const marklessSsrStateValues${name} = new Map([`));
		expect(seed.slice(0, seed.indexOf(']);'))).toContain(
			'"shared:src/components.tsrx#session/state:data", {"user":"none","status":"anonymous"}',
		);
	}
});

test('SSR derives a shared computed from the seeded factory nodes', async () => {
	const compiled = await compile('src/components.tsrx', componentsPageSource);
	const ssr = compiled.publicRenderModule.ssrModuleSource;

	// Only the component that renders it derives it, and it derives from the
	// seeded state node rather than a render-body local.
	expect(ssr).toContain(
		'marklessSsrRenderStateValues.set("shared:src/components.tsrx#session/computed:signedIn",(({read})=>{const data=read("shared:src/components.tsrx#session/state:data",[]);const derive=() => data.user !== \'none\';return derive()})',
	);
	expect(
		ssr.split('#session/computed:signedIn",(({read})').length - 1,
	).toBe(1);
});

// Cross-file `shared()` is not lowered yet: `collectHelperReturnAlias` claims the
// declaration before `collectSharedInstance` sees it, and
// ModuleGraphInterfaceArtifact carries no shared definitions for the link pass to
// hand over. The compile fails closed rather than rendering a dead instance.
test('a shared definition imported from another .tsrx module fails the compile closed', async () => {
	const compiled = await compile(
		'src/cross-file.tsrx',
		`
import { counter } from './counter.tsrx';

export function App() @{
	const pageCounter = counter();

	<output>{pageCounter.count}</output>
}
`,
	);

	expect(
		compiled.semanticGraph.diagnostics
			.filter((diagnostic) => diagnostic.severity === 'error')
			.map((diagnostic) => diagnostic.code),
	).toEqual(['MARKLESS_STATE_HELPER_RETURN_UNSUPPORTED']);
	expect(compiled.semanticGraph.sharedInstances).toEqual([]);
});
