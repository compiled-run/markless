import { describe, expect, test } from 'vitest';
import {
	evaluateLocatorResolution,
	type LocatorPlan,
	type WalkableDomAdapter,
} from '../src/locator-resolution.ts';

type Node = { type: number; tag?: string; children?: Node[] };
const element = (tag: string, children: Node[] = []): Node => ({ type: 1, tag, children });
const text = (): Node => ({ type: 3 });
const comment = (): Node => ({ type: 8 });
const adapter: WalkableDomAdapter<Node> = {
	childNodes: (node) => node.children ?? [],
	nodeType: (node) => node.type,
	tagName: (node) => node.tag,
};
const plans: LocatorPlan[] = [
	{ id: 'host', kind: 'dom-order-path', strategy: 'element-order', index: 1, tagName: 'section', hostNodeId: 'host' },
	{ id: 'branch:start', kind: 'branch-anchor', strategy: 'comment-order', index: 0 },
	{ id: 'row:button', kind: 'keyed-row', strategy: 'child-path', fromHostNodeId: 'host', path: [1, 1], nodeType: 1 },
	{ id: 'binding', kind: 'text-binding', strategy: 'child-path', fromHostNodeId: 'host', path: [0], nodeType: 3 },
	{ id: 'behavior', kind: 'behavior-host', strategy: 'host-reference', hostNodeId: 'host' },
	{ id: 'handle', kind: 'element-handle', strategy: 'host-reference', hostNodeId: 'host' },
];

describe('MLA-S3 locator resolution', () => {
	test('resolves one locator of every covered kind', () => {
		const root = element('main', [comment(), element('section', [text(), element('div', [text(), element('button')])])]);
		const result = evaluateLocatorResolution(plans, [root], adapter);
		expect(result.invariant).toEqual({ id: 'MLA-S3-LOCATOR-RESOLUTION', status: 'pass', details: [] });
		expect(result.coverage.covered).toEqual([
			'behavior-host', 'branch-anchor', 'dom-order-path', 'element-handle', 'keyed-row', 'text-binding',
		]);
	});

	test('fails a zero-resolution raw child-node path', () => {
		const result = evaluateLocatorResolution(
			[{ id: 'missing', kind: 'text-binding', strategy: 'child-path', path: [4], nodeType: 3 }],
			[element('main')],
			adapter,
		);
		expect(result.invariant.details).toEqual([
			'text-binding missing path 4 resolved to 0 nodes (expected exactly one)',
		]);
	});

	test('fails an ambiguous multi-container locator', () => {
		const result = evaluateLocatorResolution(
			[{ id: 'root', kind: 'dom-order-path', strategy: 'element-order', index: 0, tagName: 'main' }],
			[element('main'), element('main')],
			adapter,
		);
		expect(result.invariant.details[0]).toContain('resolved to 2 nodes');
	});
});
