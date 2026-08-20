import { expect, test } from 'vitest';
import { buildSemanticGraph } from '../src/passes/semantic-graph/index.ts';

test('semantic markup distinguishes modules that differ only in static markup', async () => {
	const first = await buildSemanticGraph({
		filename: 'src/First.tsrx',
		source: `export function App() @{ <main class="first"><h1>Hello</h1></main> }`,
	});
	const second = await buildSemanticGraph({
		filename: 'src/Second.tsrx',
		source: `export function App() @{ <main class="second"><h1>Goodbye</h1></main> }`,
	});

	expect(first.markup).not.toEqual(second.markup);
	expect(first.markup.root).toEqual({ componentName: 'App', templateId: 'template:App' });
	expect(first.markup.chunks).toContainEqual(
		expect.objectContaining({
			id: 'template:App',
			kind: 'template',
			statics: ['<main class="first"><h1>Hello</h1></main>'],
			slots: [],
		}),
	);
});

test('semantic markup records native statics and direct coordinates for every dynamic shape', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source: `
import { computed, state } from '@markless/core';
import { Badge } from './Badge.tsrx';

export function App() @{
	const title = state('Hello');
	const active = state(true);
	const rows = state([]);
	const details = computed(async () => ({ label: title }));
	<main data-title={title}>
		<header><h1>{title + '!'}</h1><Badge label={title} /></header>
		@if (active) { <p>Active {title}</p> } @else { <p>Idle</p> }
		@for (const row of rows; key row.id) { <article><b>{row.name}</b></article> } @empty { <i>No rows</i> }
		@try { <section>{details.label}</section> } @pending { <em>Loading</em> } @catch (error) { <strong>{error.message}</strong> }
	</main>
}
`,
	});

	expect(graph.markup.root).toEqual({ componentName: 'App', templateId: 'template:App' });
	const root = graph.markup.chunks.find((chunk) => chunk.id === 'template:App');
	expect(root?.statics.join('')).toContain('<main><header><h1>');
	expect(root?.slots).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: 'attribute',
				name: 'data-title',
				coordinate: { kind: 'child-index', path: [0] },
			}),
			expect.objectContaining({
				kind: 'text',
				coordinate: { kind: 'comment-anchor', path: [0, 0, 0, 0] },
			}),
			expect.objectContaining({
				kind: 'child-component',
				childComponentName: 'Badge',
				coordinate: { kind: 'comment-anchor', path: [0, 0, 1] },
			}),
			expect.objectContaining({
				kind: 'branch',
				branchSiteId: 'branch-site:0',
				coordinate: { kind: 'comment-anchor', path: [0, 1] },
			}),
			expect.objectContaining({
				kind: 'repeat',
				repeatId: 'repeat:0',
				coordinate: { kind: 'comment-anchor', path: [0, 2] },
			}),
			expect.objectContaining({
				kind: 'async',
				boundaryId: 'boundary:0',
				coordinate: { kind: 'comment-anchor', path: [0, 3] },
			}),
		]),
	);

	expect(graph.markup.chunks).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				id: 'branch:branch-site:0:arm:0',
				statics: expect.any(Array),
			}),
			expect.objectContaining({ id: 'branch:branch-site:0:arm:1', statics: ['<p>Idle</p>'] }),
			expect.objectContaining({
				id: 'repeat:repeat:0:row',
				statics: expect.arrayContaining([
					expect.stringContaining('<article><b>'),
					expect.stringContaining('</b></article>'),
				]),
				slots: expect.arrayContaining([
					expect.objectContaining({
						kind: 'text',
						residue: { kind: 'repeat-item', repeatId: 'repeat:0', path: ['name'] },
						coordinate: { kind: 'comment-anchor', path: [0, 0, 0] },
					}),
				]),
			}),
			expect.objectContaining({ id: 'repeat:repeat:0:empty', statics: ['<i>No rows</i>'] }),
			expect.objectContaining({ id: 'async:boundary:0:arm:try' }),
			expect.objectContaining({
				id: 'async:boundary:0:arm:pending',
				statics: ['<em>Loading</em>'],
			}),
			expect.objectContaining({ id: 'async:boundary:0:arm:catch' }),
		]),
	);
});

test('semantic markup records one bounded dynamic-host slot with its tag and child chunk', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/DynamicCard.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let tag = state('article');
	let label = state('Ready');

	<section>
		<{tag} class="card" data-label={label}>
			<h2>Profile</h2>
			<span>{label}</span>
		</{tag}>
		<footer>Done</footer>
	</section>
}
`,
	});

	const root = graph.markup.chunks.find((chunk) => chunk.id === 'template:App');
	expect(graph.hostNodes).toContainEqual(expect.objectContaining({ id: 'h1', tagName: '*' }));
	expect(root?.statics.join('')).toContain(
		'<section><!--markless-slot:0--><footer>Done</footer></section>',
	);
	expect(root?.slots).toContainEqual(
		expect.objectContaining({
			kind: 'dynamic-host',
			cardinality: 'zero-or-one',
			nullishTag: 'omit',
			coordinate: { kind: 'comment-anchor', path: [0, 0] },
			tag: expect.objectContaining({ kind: 'graph-read' }),
			staticAttributes: { class: 'card' },
			attributeSlots: [
				expect.objectContaining({
					name: 'data-label',
					residue: expect.objectContaining({ kind: 'graph-read' }),
				}),
			],
			childChunkId: 'dynamic-host:template:App:0:children',
		}),
	);
	expect(graph.markup.chunks).toContainEqual(
		expect.objectContaining({
			id: 'dynamic-host:template:App:0:children',
			kind: 'dynamic-host-children',
			statics: expect.arrayContaining([
				expect.stringContaining('<h2>Profile</h2><span>'),
				expect.stringContaining('</span>'),
			]),
			slots: [
				expect.objectContaining({
					kind: 'text',
					coordinate: { kind: 'comment-anchor', path: [1, 0] },
				}),
			],
		}),
	);
});
