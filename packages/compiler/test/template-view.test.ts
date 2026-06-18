import { expect, test } from 'vitest';
import type { SemanticGraphArtifact } from '../src/artifacts.ts';
import { buildSemanticGraph, lowerStateAccess, planTemplateView } from '../src/index.ts';

const source = `
import { state, computed } from '@arcade/core';

export function App() @{
	let count = state(0);
	const double = computed(() => count * 2);

	<>
		<button data-counter type="button" title={count} onClick={() => count++}>
			{count} / {double}
		</button>
		<span>hello</span>
	</>
}
`;

const sharedSource = `
import { shared, state } from '@arcade/core';

export const shell = shared(() => {
	const data = state({ activeCartId: 'server-cart', status: 'server-ready' });

	return {
		...data,
	};
}, { scope: 'page' });

export function App() @{
	const pageShell = shell();

	<section>
		<button onClick={() => pageShell.status = 'client-ready'}>{pageShell.status}</button>
		<aside>{pageShell.activeCartId} / {pageShell.status}</aside>
	</section>
}
`;

const sharedDefinitionSource = `
import { shared, state } from '@arcade/core';

export const shell = shared(() => {
	const data = state({ activeCartId: 'server-cart', status: 'server-ready' });

	return {
		...data,
	};
}, { scope: 'page' });
`;

const importedSharedSource = `
import { shell } from './shared-shell.tsrx';

export function App() @{
	const pageShell = shell();

	<section>
		<button onClick={() => pageShell.status = 'client-ready'}>{pageShell.status}</button>
		<aside>{pageShell.activeCartId} / {pageShell.status}</aside>
	</section>
}
`;

test('planTemplateView creates readable initial render records for a simple template', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });

	const templateView = planTemplateView({ semanticGraph, stateLowering });

	expect(templateView.passId).toBe('template-view');
	expect(templateView.components).toEqual([
		{
			name: 'App',
			rootNodeIds: ['template:0', 'template:4'],
			initialHtml:
				'<button data-counter type="button" title="0">0 / 0</button><span>hello</span>',
		},
	]);
	expect(templateView.nodes).toEqual([
		{
			id: 'template:0',
			kind: 'element',
			hostNodeId: 'h0',
			tagName: 'button',
			parentId: null,
			attributes: [
				{ kind: 'static', name: 'data-counter', value: true },
				{ kind: 'static', name: 'type', value: 'button' },
				{
					kind: 'binding',
					name: 'title',
					source: 'count',
					graphNodeId: 'state:count',
					path: [],
					initialValue: 0,
					target: { kind: 'attribute', name: 'title' },
					sourceSpan: expect.objectContaining({ filename: 'src/App.tsrx' }),
				},
			],
			childNodeIds: ['template:1', 'template:2', 'template:3'],
		},
		{
			id: 'template:1',
			kind: 'binding',
			parentId: 'template:0',
			hostNodeId: 'h0',
			source: 'count',
			graphNodeId: 'state:count',
			path: [],
			target: { kind: 'text' },
			initialValue: 0,
			sourceSpan: expect.objectContaining({ filename: 'src/App.tsrx' }),
		},
		{
			id: 'template:2',
			kind: 'text',
			value: ' / ',
			parentId: 'template:0',
		},
		{
			id: 'template:3',
			kind: 'binding',
			parentId: 'template:0',
			hostNodeId: 'h0',
			source: 'double',
			graphNodeId: 'computed:double',
			path: [],
			target: { kind: 'text' },
			initialValue: 0,
			sourceSpan: expect.objectContaining({ filename: 'src/App.tsrx' }),
		},
		{
			id: 'template:4',
			kind: 'element',
			hostNodeId: 'h1',
			tagName: 'span',
			parentId: null,
			attributes: [],
			childNodeIds: ['template:5'],
		},
		{
			id: 'template:5',
			kind: 'text',
			value: 'hello',
			parentId: 'template:4',
		},
	]);
	expect(templateView.diagnostics).toEqual([]);
});

test('planTemplateView renders initial shared instance return-property values', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/root.tsrx',
		source: sharedSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });

	const templateView = planTemplateView({ semanticGraph, stateLowering });

	expect(templateView.components).toEqual([
		{
			name: 'App',
			rootNodeIds: ['template:0'],
			initialHtml:
				'<section><button>server-ready</button><aside>server-cart / server-ready</aside></section>',
		},
	]);
	expect(templateView.nodes).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: 'binding',
				source: 'pageShell.activeCartId',
				graphNodeId: 'shared:src/root.tsrx#shell/state:data',
				path: ['activeCartId'],
				initialValue: 'server-cart',
			}),
			expect.objectContaining({
				kind: 'binding',
				source: 'pageShell.status',
				graphNodeId: 'shared:src/root.tsrx#shell/state:data',
				path: ['status'],
				initialValue: 'server-ready',
			}),
		]),
	);
});

test('planTemplateView renders imported shared instance return-property values', async () => {
	const sharedDefinitionGraph = await buildSemanticGraph({
		filename: 'src/shared-shell.tsrx',
		source: sharedDefinitionSource,
	});
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/root.tsrx',
		source: importedSharedSource,
		importedSharedDefinitions: importedSharedDefinitionsFrom(sharedDefinitionGraph),
	});
	const stateLowering = lowerStateAccess({ semanticGraph });

	const templateView = planTemplateView({ semanticGraph, stateLowering });

	expect(templateView.components).toEqual([
		{
			name: 'App',
			rootNodeIds: ['template:0'],
			initialHtml:
				'<section><button>server-ready</button><aside>server-cart / server-ready</aside></section>',
		},
	]);
	expect(templateView.nodes).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: 'binding',
				source: 'pageShell.activeCartId',
				graphNodeId: 'shared:src/shared-shell.tsrx#shell/state:data',
				path: ['activeCartId'],
				initialValue: 'server-cart',
			}),
			expect.objectContaining({
				kind: 'binding',
				source: 'pageShell.status',
				graphNodeId: 'shared:src/shared-shell.tsrx#shell/state:data',
				path: ['status'],
				initialValue: 'server-ready',
			}),
		]),
	);
});

function importedSharedDefinitionsFrom(graph: SemanticGraphArtifact) {
	return graph.sharedDefinitions.map((definition) => ({
		definition,
		graphBindings: graph.graphBindings.filter(
			(binding) => binding.sharedDefinitionId === definition.id,
		),
	}));
}
