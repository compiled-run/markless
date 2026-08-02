import { expect, test } from 'vitest';
import { evaluatePrerenderClosure } from '../src/prerender/evaluator.ts';

test('evaluates a linked page closure without reparsing markup or authored source', async () => {
	const child = {
		renderData: {
			root: { componentName: 'Child', templateId: 'template:Child' },
			chunks: [
				{
					id: 'template:Child',
					kind: 'template' as const,
					componentName: 'Child',
					statics: ['<strong><!--markless-slot:0-->', '</strong>'],
					hosts: [
						{
							hostNodeId: 'h0',
							tagName: 'strong',
							coordinate: { kind: 'child-index' as const, path: [0] },
						},
					],
					slots: [
						{
							kind: 'text' as const,
							residue: {
								kind: 'graph-read' as const,
								graphNodeId: 'prop:props',
								path: ['label'],
							},
							coordinate: { kind: 'comment-anchor' as const, path: [0, 0] },
							staticIndex: 0,
						},
					],
				},
			],
			repeats: [],
			boundaries: [],
			initialValues: [],
		},
	};
	const constant = { label: 'Ready' };
	const output = await evaluatePrerenderClosure({
		renderData: {
			root: { componentName: 'Page', templateId: 'template:Page' },
			chunks: [
				{
					id: 'template:Page',
					kind: 'template',
					componentName: 'Page',
					statics: ['<main><!--markless-slot:0-->', '<!--markless-slot:1-->', '</main>'],
					hosts: [
						{
							hostNodeId: 'h0',
							tagName: 'main',
							coordinate: { kind: 'child-index', path: [0] },
						},
					],
					slots: [
						{
							kind: 'child-component',
							componentEdgeId: 'component-edge:0',
							childComponentName: 'Child',
							childTemplateId: 'template:Child',
							coordinate: { kind: 'comment-anchor', path: [0, 0] },
							staticIndex: 0,
						},
						{
							kind: 'branch',
							branchSiteId: 'branch:0',
							armTemplateIds: ['branch:0:on', 'branch:0:off'],
							coordinate: { kind: 'comment-anchor', path: [0, 1] },
							staticIndex: 1,
						},
					],
				},
				{
					id: 'branch:0:on',
					kind: 'branch-arm',
					componentName: 'Page',
					statics: ['<i><!--markless-slot:0-->', '</i>'],
					hosts: [],
					slots: [
						{
							kind: 'text',
							residue: {
								kind: 'graph-read',
								graphNodeId: 'computed:upper',
								path: [],
							},
							coordinate: { kind: 'comment-anchor', path: [0, 0] },
							staticIndex: 0,
						},
					],
				},
				{
					id: 'branch:0:off',
					kind: 'branch-arm',
					componentName: 'Page',
					statics: ['<i>Off</i>'],
					hosts: [],
					slots: [],
				},
			],
			repeats: [],
			boundaries: [],
			initialValues: [
				{ graphNodeId: 'state:item', value: { kind: 'constant', value: constant } },
			],
		},
		computed: [
			{
				graphNodeId: 'computed:upper',
				evaluate: ({ read }) => {
					constant.label = 'Mutated outside the closure';
					return String((read('state:item') as { label: string }).label).toUpperCase();
				},
			},
		],
		selectBranchArm: (_slot, _context, { read }) =>
			read('computed:upper') === 'READY' ? 0 : 1,
		children: {
			'component-edge:0': {
				closure: child,
				props: ({ read }) => ({ label: (read('state:item') as { label: string }).label }),
			},
		},
	});

	expect(output.html).toBe(
		'<main><strong>Ready</strong><!--markless:branch:branch:0--><i>READY</i><!--/markless:branch:branch:0--></main>',
	);
});
