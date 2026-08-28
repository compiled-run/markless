import { expect, test } from 'vitest';
import { staticProjectionChildren } from '../../src/passes/public-render/shared-seed-pass.ts';
import type { SemanticMarkupChunk } from '../../src/artifacts.ts';

/**
 * The one question the seed pass can ask about a projection before it renders:
 * is what the consumer wrote between the tags already spelled in the chunk? A
 * slot is the line, not an element - and what comes back is text content, so the
 * HTML the statics are written in is decoded on the way out.
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

test('a projection carrying an element answers with the element\'s text content', () => {
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
	).toBe('30 of 100');
});

test('the statics are HTML, so what comes back is decoded', () => {
	expect(
		staticProjectionChildren(
			[chunk({ statics: ['Tom &amp; Jerry &lt;rows&gt;'] })],
			'projection:component-edge:2',
		),
	).toBe('Tom & Jerry <rows>');
});

// One left-to-right pass: chaining the replacements would decode the `&lt;` this
// text spells as an escaped ampersand into a real `<`.
test('an entity the consumer wrote as text survives as the text they wrote', () => {
	expect(
		staticProjectionChildren(
			[chunk({ statics: ['write &amp;lt; for a tag'] })],
			'projection:component-edge:2',
		),
	).toBe('write &lt; for a tag');
});

test('an attribute value is dropped with its tag, entities and all', () => {
	expect(
		staticProjectionChildren(
			[chunk({ statics: ['<em title="a&gt;b">50</em> rows'] })],
			'projection:component-edge:2',
		),
	).toBe('50 rows');
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
