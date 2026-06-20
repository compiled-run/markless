import { expect, test } from 'vitest';
import { buildSemanticGraph } from '../src/index.ts';

const source = `
import { state, computed, element } from '@arcadejs/core';
import { makeChart } from './chart';

export function App({ label }: { label: string }) @{
	let count = state(0);
	const menu = state({ open: true, title: 'Menu', meta: { label: 'Main' } });
	const { title: menuTitle } = menu;
	const { meta: { label: menuLabel } } = menu;
	const { title: restTitle, ...menuRest } = menu;
	const doubled = computed(() => count * 2);
	const details = computed(async ({ signal }) => {
		const id = menu.title;
		const response = await fetch('/api/details/' + id, { signal });
		return await response.json();
	});
	let input = element<HTMLInputElement>();

	<section>
		<input
			el={input}
			value={menu.title}
			onKeyDown={(event) => {
				if (menu.open && event.key === 'Escape') {
					event.preventDefault();
					event.stopPropagation();
					menu.open = false;
				}
			}}
		/>
		<button onClick={() => count++}>{label}: {count} and {doubled} and {menuTitle} and {menuLabel} and {menuRest.meta.label}</button>
		<canvas attach={makeChart(details)} />
		@try {
			<p>{details.title}</p>
		} @pending {
			<p>Loading</p>
		} @catch (error) {
			<p>{error.message}</p>
		}
	</section>
}
`;

const sharedSource = `
import { shared, state, computed } from '@arcadejs/core';

export const session = shared(() => {
	const data = state({ user: null, status: 'anonymous' });
	const signedIn = computed(() => data.user !== null);

	return {
		...data,
		signedIn,
		logout() {
			data.user = null;
			data.status = 'anonymous';
		},
	};
}, { scope: 'page' });

export function Header() @{
	const currentSession = session();

	<button onClick={() => currentSession.logout()}>{currentSession.status}</button>
}
`;

const sharedDependencySource = `
import { shared, state } from '@arcadejs/core';

export const session = shared(() => {
	const data = state({ user: null });
	return data;
});

export const cart = shared(() => {
	const s = session();
	const items = state([]);

	return {
		items,
		user: s.user,
	};
}, { scope: 'container' });

export function CartButton() @{
	const activeCart = cart();

	<button>{activeCart.items.length}</button>
}
`;

const keyedTableSource = `
import { state } from '@arcadejs/core';

export function App() @{
	const rows = state([]);
	const selected = state(null);

	<div>
		<table>
			<tbody>
				@for (const row of rows; key row.id) {
					<tr class={selected === row.id ? 'active' : ''}>
						<td>{row.id}</td>
						<td>{row.label}</td>
					</tr>
				}
			</tbody>
		</table>
	</div>
}
`;

const keyedListSource = `
import { state } from '@arcadejs/core';

export function App() @{
	const items = state([]);

	<section>
		<ul>
			@for (const item of items; key item.key) {
				<li>
					<button onClick={() => console.log(item.key)}>{item.name}</button>
				</li>
			}
		</ul>
	</section>
}
`;

test('buildSemanticGraph creates the first production compiler artifact', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source,
	});

	expect(graph.passId).toBe('tsrx-semantic-graph');
	expect(graph.components).toEqual([{ name: 'App' }]);
	expect(graph.moduleImports).toEqual([
		{
			localName: 'makeChart',
			importedName: 'makeChart',
			source: './chart',
			kind: 'named',
		},
	]);

	expect(graph.graphBindings).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				name: 'count',
				kind: 'state',
				writable: true,
				valueKind: 'scalar',
			}),
			expect.objectContaining({
				name: 'menu',
				kind: 'state',
				writable: true,
				valueKind: 'object',
			}),
			expect.objectContaining({
				name: 'doubled',
				kind: 'computed',
				writable: false,
				async: false,
			}),
			expect.objectContaining({
				name: 'details',
				kind: 'computed',
				writable: false,
				async: true,
			}),
			expect.objectContaining({
				name: 'input',
				kind: 'element',
				writable: false,
			}),
			expect.objectContaining({
				name: 'props',
				kind: 'prop',
				writable: false,
				valueKind: 'object',
			}),
		]),
	);

	expect(graph.hostNodes.map((node) => node.tagName)).toEqual([
		'section',
		'input',
		'button',
		'canvas',
		'p',
		'p',
		'p',
	]);

	expect(graph.aliases).toEqual([
		{
			name: 'label',
			target: 'props.label',
			declarationKind: 'const',
			sourceSpan: expect.objectContaining({
				filename: 'src/App.tsrx',
			}),
		},
		{
			name: 'menuTitle',
			target: 'menu.title',
			declarationKind: 'const',
			sourceSpan: expect.objectContaining({
				filename: 'src/App.tsrx',
			}),
		},
		{
			name: 'menuLabel',
			target: 'menu.meta.label',
			declarationKind: 'const',
			sourceSpan: expect.objectContaining({
				filename: 'src/App.tsrx',
			}),
		},
		{
			name: 'restTitle',
			target: 'menu.title',
			declarationKind: 'const',
			sourceSpan: expect.objectContaining({
				filename: 'src/App.tsrx',
			}),
		},
		{
			name: 'menuRest',
			target: 'menu',
			declarationKind: 'const',
			excludedPaths: [['title']],
			sourceSpan: expect.objectContaining({
				filename: 'src/App.tsrx',
			}),
		},
	]);

	expect(graph.events).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				eventName: 'keydown',
				handlerCount: 1,
				handlerParameters: [['event']],
				hasSyncPolicyCandidate: true,
			}),
			expect.objectContaining({
				eventName: 'click',
				handlerCount: 1,
				handlerParameters: [[]],
				hasSyncPolicyCandidate: false,
			}),
		]),
	);

	expect(graph.behaviors).toEqual([
		expect.objectContaining({
			source: 'makeChart(details)',
			functionSource: 'makeChart',
			inputSources: ['details'],
		}),
	]);

	expect(graph.templateReads).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ source: 'menu.title' }),
			expect.objectContaining({ source: 'label' }),
			expect.objectContaining({ source: 'count' }),
			expect.objectContaining({ source: 'doubled' }),
			expect.objectContaining({ source: 'menuTitle' }),
			expect.objectContaining({ source: 'menuLabel' }),
			expect.objectContaining({ source: 'menuRest.meta.label' }),
			expect.objectContaining({ source: 'details.title' }),
			expect.objectContaining({ source: 'error.message' }),
		]),
	);

	expect(graph.stateWrites).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ target: 'menu.open', operation: 'assign' }),
			expect.objectContaining({ target: 'count', operation: 'update' }),
		]),
	);

	expect(graph.asyncBoundaries).toHaveLength(1);
});

test('buildSemanticGraph records keyed repeat structure without benchmark assumptions', async () => {
	const tableGraph = await buildSemanticGraph({
		filename: 'src/TableRows.tsrx',
		source: keyedTableSource,
	});
	const tableParent = tableGraph.hostNodes.find((hostNode) => hostNode.tagName === 'tbody');
	const tableRow = tableGraph.hostNodes.find((hostNode) => hostNode.tagName === 'tr');

	expect(tableGraph.keyedRepeats).toEqual([
		{
			id: 'repeat:0',
			parentHostNodeId: tableParent?.id,
			rowHostNodeId: tableRow?.id,
			itemName: 'row',
			collectionSource: 'rows',
			collectionGraphNodeId: 'state:rows',
			collectionPath: [],
			keySource: 'row.id',
			keyPath: ['id'],
		},
	]);

	const listGraph = await buildSemanticGraph({
		filename: 'src/ItemList.tsrx',
		source: keyedListSource,
	});
	const listParent = listGraph.hostNodes.find((hostNode) => hostNode.tagName === 'ul');
	const listRow = listGraph.hostNodes.find((hostNode) => hostNode.tagName === 'li');

	expect(listGraph.keyedRepeats).toEqual([
		{
			id: 'repeat:0',
			parentHostNodeId: listParent?.id,
			rowHostNodeId: listRow?.id,
			itemName: 'item',
			collectionSource: 'items',
			collectionGraphNodeId: 'state:items',
			collectionPath: [],
			keySource: 'item.key',
			keyPath: ['key'],
		},
	]);
});

test('buildSemanticGraph records shared definitions and instance calls', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/session.tsrx',
		source: sharedSource,
	});
	const sharedStart = sharedSource.indexOf('shared(() =>');
	const instanceStart = sharedSource.indexOf('session();');

	expect(graph.sharedDefinitions).toEqual([
		expect.objectContaining({
			id: 'shared:src/session.tsrx#session',
			name: 'session',
			exportedName: 'session',
			scope: 'page',
			factorySource: expect.stringContaining('const data = state'),
			sourceSpan: {
				filename: 'src/session.tsrx',
				start: sharedStart,
				end: sharedSource.indexOf(';\n\nexport function Header'),
			},
		}),
	]);
	expect(graph.sharedInstances).toEqual([
		{
			definitionId: 'shared:src/session.tsrx#session',
			definitionName: 'session',
			localName: 'currentSession',
			source: 'session()',
			sourceSpan: {
				filename: 'src/session.tsrx',
				start: instanceStart,
				end: instanceStart + 'session()'.length,
			},
		},
	]);
	expect(graph.diagnostics).toEqual([]);
});

test('buildSemanticGraph records imported shared instance calls with stable source identity', async () => {
	const importedSharedSource = `
import { session as useSession } from './session.tsrx';

export function Header() @{
	const currentSession = useSession();

	<button>{currentSession.status}</button>
}
`;
	const graph = await buildSemanticGraph({
		filename: 'src/Header.tsrx',
		source: importedSharedSource,
	});
	const instanceStart = importedSharedSource.indexOf('useSession();');

	expect(graph.moduleImports).toEqual([
		{
			localName: 'useSession',
			importedName: 'session',
			source: './session.tsrx',
			kind: 'named',
		},
	]);
	expect(graph.sharedDefinitions).toEqual([]);
	expect(graph.sharedInstances).toEqual([
		{
			definitionId: 'shared:./session.tsrx#session',
			definitionName: 'session',
			localName: 'currentSession',
			source: 'useSession()',
			sourceSpan: {
				filename: 'src/Header.tsrx',
				start: instanceStart,
				end: instanceStart + 'useSession()'.length,
			},
		},
	]);
	expect(graph.diagnostics).toEqual([]);
});

test('buildSemanticGraph records same-module shared definition dependencies', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/cart.tsrx',
		source: sharedDependencySource,
	});
	const dependencyStart = sharedDependencySource.indexOf('session();');
	const instanceStart = sharedDependencySource.indexOf('cart();');
	const cart = graph.sharedDefinitions.find((definition) => definition.name === 'cart');

	expect(cart).toEqual(
		expect.objectContaining({
			id: 'shared:src/cart.tsrx#cart',
			name: 'cart',
			exportedName: 'cart',
			scope: 'container',
			dependencies: [
				{
					definitionId: 'shared:src/cart.tsrx#session',
					definitionName: 'session',
					source: 'session()',
					sourceSpan: {
						filename: 'src/cart.tsrx',
						start: dependencyStart,
						end: dependencyStart + 'session()'.length,
					},
				},
			],
		}),
	);
	expect(graph.sharedInstances).toEqual([
		{
			definitionId: 'shared:src/cart.tsrx#cart',
			definitionName: 'cart',
			localName: 'activeCart',
			source: 'cart()',
			sourceSpan: {
				filename: 'src/cart.tsrx',
				start: instanceStart,
				end: instanceStart + 'cart()'.length,
			},
		},
	]);
	expect(graph.diagnostics).toEqual([]);
});

test('buildSemanticGraph records graph bindings inside shared factories', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/session.tsrx',
		source: sharedSource,
	});

	expect(graph.graphBindings).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				id: 'shared:src/session.tsrx#session/state:data',
				name: 'data',
				kind: 'state',
				sharedDefinitionId: 'shared:src/session.tsrx#session',
				writable: true,
				valueKind: 'object',
				initialValue: {
					user: null,
					status: 'anonymous',
				},
			}),
			expect.objectContaining({
				id: 'shared:src/session.tsrx#session/computed:signedIn',
				name: 'signedIn',
				kind: 'computed',
				sharedDefinitionId: 'shared:src/session.tsrx#session',
				writable: false,
				async: false,
				dependencies: [
					{
						source: 'data.user',
						graphNodeId: 'shared:src/session.tsrx#session/state:data',
						path: ['user'],
					},
				],
			}),
		]),
	);
	expect(graph.sharedDefinitions[0]?.returnProperties).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: 'graph',
				name: 'user',
				source: '...data',
				graphNodeId: 'shared:src/session.tsrx#session/state:data',
				path: ['user'],
			}),
			expect.objectContaining({
				kind: 'graph',
				name: 'status',
				source: '...data',
				graphNodeId: 'shared:src/session.tsrx#session/state:data',
				path: ['status'],
			}),
			expect.objectContaining({
				kind: 'graph',
				name: 'signedIn',
				source: 'signedIn',
				graphNodeId: 'shared:src/session.tsrx#session/computed:signedIn',
				path: [],
			}),
			expect.objectContaining({
				kind: 'method',
				name: 'logout',
				source: expect.stringContaining('logout()'),
			}),
		]),
	);
	expect(graph.stateReads).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				source: 'data.user',
				sharedDefinitionId: 'shared:src/session.tsrx#session',
			}),
		]),
	);
	expect(graph.stateWrites).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				target: 'data.user',
				sharedDefinitionId: 'shared:src/session.tsrx#session',
				operation: 'assign',
				valueSource: 'null',
			}),
			expect.objectContaining({
				target: 'data.status',
				sharedDefinitionId: 'shared:src/session.tsrx#session',
				operation: 'assign',
				valueSource: "'anonymous'",
			}),
		]),
	);
	expect(graph.diagnostics).toEqual([]);
});
