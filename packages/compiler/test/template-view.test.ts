import { expect, test } from 'vitest';
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
