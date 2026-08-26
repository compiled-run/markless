import { expect, test } from 'vitest';
import { staticProjectionChildren } from '../../src/passes/public-render/shared-seed-pass.ts';
import type { SemanticMarkupChunk } from '../../src/artifacts.ts';

/**
 * The one question the seed pass can ask about a projection before it renders:
 * is what the consumer wrote between the tags already spelled in the chunk?
 */
function chunk(overrides: Partial<SemanticMarkupChunk>): SemanticMarkupChunk {
	return {
		id: 'projection:component-edge:2',
		kind: 'component-projection',
		componentName: 'Page',
		statics: [],
		hosts: [],
		slots: [],
		...overrides,
	};
}

test('a projection of static text alone answers with that text', () => {
	expect(
		staticProjectionChildren(
			[chunk({ statics: ['30 of 100 rows'] })],
			'projection:component-edge:2',
		),
	).toBe('30 of 100 rows');
});

test('an empty projection answers with the empty string, not undefined', () => {
	expect(staticProjectionChildren([chunk({ statics: [''] })], 'projection:component-edge:2')).toBe(
		'',
	);
});

test('a projection carrying an element answers with nothing', () => {
	expect(
		staticProjectionChildren(
			[
				chunk({
					statics: ['<em>30</em> of 100'],
					hosts: [{ hostNodeId: 'h4', tagName: 'em', coordinate: { kind: 'child-index', path: [0] } }],
				}),
			],
			'projection:component-edge:2',
		),
	).toBeUndefined();
});

test('a projection carrying a read answers with nothing', () => {
	expect(
		staticProjectionChildren(
			[
				chunk({
					statics: ['', ' rows'],
					slots: [
						{
							kind: 'text',
							residue: { kind: 'graph-read', graphNodeId: 'state:count', path: [] },
							coordinate: { kind: 'comment-anchor', path: [0] },
							staticIndex: 0,
						},
					],
				}),
			],
			'projection:component-edge:2',
		),
	).toBeUndefined();
});

test('an edge with no projection at all answers with nothing', () => {
	expect(staticProjectionChildren([chunk({ statics: ['text'] })], undefined)).toBeUndefined();
});
