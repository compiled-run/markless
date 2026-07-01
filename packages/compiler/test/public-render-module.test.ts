import { expect, test } from 'vitest';
import {
	domNodePathExpression,
	graphReadExpression,
	itemPathReadSource,
} from '../src/passes/public-render/source-expressions.ts';
import { createPublicProtocolView } from '../src/passes/public-render/view-filter.ts';
import { isDirectPublicLiteralValue } from '../src/passes/public-render/state-entries.ts';

test('public render module source helpers keep generated path expressions readable', () => {
	expect(itemPathReadSource('item', ['code'])).toBe('item.code');
	expect(itemPathReadSource('item', ['copy', 'name'])).toBe(
		'readMarklessPublicPath(item, ["copy","name"])',
	);
	expect(graphReadExpression('state:chosen', [])).toBe('graph.read("state:chosen")');
	expect(graphReadExpression('state:score', ['total'])).toBe(
		'graph.read("state:score", ["total"])',
	);
	expect(domNodePathExpression('root', [2, 1])).toBe('root.childNodes?.[2]?.childNodes?.[1]');
});

test('public render module protocol view helper keeps only direct public records', () => {
	const protocolView = {
		locators: [
			{ hostNodeId: 'host:root', index: 7 },
			{ hostNodeId: 'host:repeat-row', index: 8 },
		],
		events: [
			{ hostNodeId: 'host:root', eventName: 'click' },
			{ hostNodeId: 'host:repeat-row', eventName: 'click' },
		],
		domUpdates: [
			{
				hostNodeId: 'host:root',
				graphNodeId: 'state:score',
				path: ['total'],
				source: 'score.total',
				target: { kind: 'text' },
			},
			{
				hostNodeId: 'host:root',
				graphNodeId: 'state:flag',
				path: [],
				source: 'flag',
				target: { kind: 'attribute', name: 'hidden' },
			},
			{
				hostNodeId: 'host:repeat-row',
				graphNodeId: 'state:items',
				path: [],
				source: 'items',
				target: { kind: 'text' },
			},
		],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	} as any;
	const publicRenderPlan = {
		staticHostNodeIds: ['host:root'],
		staticTextWrites: [
			{
				graphNodeId: 'state:score',
				path: ['total'],
				source: 'score.total',
			},
		],
	} as any;

	const publicView = createPublicProtocolView(protocolView, publicRenderPlan);

	expect(publicView.locators).toEqual([{ hostNodeId: 'host:root', index: 0 }]);
	expect(publicView.events).toEqual([{ hostNodeId: 'host:root', eventName: 'click' }]);
	expect(publicView.domUpdates).toEqual([
		{
			hostNodeId: 'host:root',
			graphNodeId: 'state:flag',
			path: [],
			source: 'flag',
			target: { kind: 'attribute', name: 'hidden' },
		},
	]);
});

test('public render module literal gate accepts only directly embeddable state values', () => {
	expect(isDirectPublicLiteralValue({ items: [{ id: 1, label: 'One' }], selected: null })).toBe(
		true,
	);
	expect(isDirectPublicLiteralValue(new Date('2026-06-16T12:00:00.000Z'))).toBe(false);

	const recursive: unknown[] = [];
	recursive.push(recursive);
	expect(isDirectPublicLiteralValue(recursive)).toBe(false);
});
