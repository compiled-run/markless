import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

async function compile(name: string, source: string) {
	const compiled = await compileTsrxModule({
		filename: `/src/${name}.tsrx`,
		buildId: 'served-render-data',
		resolverId: 'served-render-data',
		symbols: [],
		source,
	});
	const served = compiled.publicRenderModule.servedRenderData;
	if (!served)
		throw new Error(
			`${name} compiled no served render data: ${JSON.stringify(compiled.publicRenderModule.diagnostics.map((item) => item.message))}`,
		);
	return { compiled, served };
}

function chunksOf(moduleSource: string) {
	const json = moduleSource.slice(moduleSource.indexOf('{'), moduleSource.lastIndexOf('}') + 1);
	return (JSON.parse(json) as { chunks: Array<{ id: string; statics: string[] }> }).chunks;
}

const shapes = [
	{
		name: 'Drawing',
		data: 'drawing',
		list: 'views',
		attribute: 'd',
		live: 'rows',
		tag: 'path',
		branch: 'open',
	},
	{
		name: 'Ledger',
		data: 'ledger',
		list: 'pages',
		attribute: 'data-line',
		live: 'entries',
		tag: 'li',
		branch: 'shown',
	},
];

test.each(shapes)(
	'$name: markup the browser never renders keeps its slots but not its markup or the data it reads',
	async ({ name, data, list, attribute, live, tag, branch }) => {
		const { compiled, served } = await compile(
			name,
			`import { state } from '@markless/core';
import { ${data} } from './${data}.ts';
const CAPTION = 'fixed caption';
export default function ${name}() @{
	let ${live} = state([{ id: 'a', label: 'A' }]);
	let ${branch} = state(false);
	<section title={CAPTION}>
		<div>
			@for (const item of ${data}.${list}; key item.key) {
				<${tag} ${attribute}={item.ink} data-wide={${data}.width + 'px'} />
			}
		</div>
		<div>
			@for (const row of ${live}; key row.id) {
				<p data-label={row.label + ' / ' + CAPTION}>{row.label}</p>
			}
		</div>
		<div>
			@if (${branch}) {
				<aside data-size={${data}.width}>more</aside>
			}
		</div>
		<button onClick={() => (${branch} = !${branch})}>toggle</button>
	</section>
}`,
		);
		const full = String(
			(
				compiled.publicRenderModule.componentDefinitions[0] as {
					residueReaderSource?: string;
				}
			).residueReaderSource,
		);
		const reader = served.readers[name] ?? '';
		expect(full).toContain(`${data}.${list}`);
		// The fixed list and the markup around it render only on the server.
		expect(reader).not.toContain(`${data}.${list}`);
		expect(reader).not.toContain(`case "CAPTION"`);
		expect(served.imports.map((entry) => entry.source)).not.toContain(`./${data}.ts`);
		// The live rows render in the browser, with what they read.
		expect(reader).toContain(`row.label + ' / ' + CAPTION`);
		expect(served.declarations.join('\n')).toContain('CAPTION');

		const fullChunks = chunksOf(compiled.publicRenderModule.renderDataModuleSource);
		const servedChunks = chunksOf(served.renderDataModuleSource);
		expect(servedChunks.map((chunk) => chunk.id)).toEqual(fullChunks.map((chunk) => chunk.id));
		for (const [index, chunk] of servedChunks.entries()) {
			const full = fullChunks[index]!;
			expect(chunk.statics).toHaveLength(full.statics.length);
			const rendered = chunk.statics.some((part) => part !== '');
			if (full.statics.some((part) => new RegExp(`<${tag}[\\s>]`).test(part)))
				expect(rendered, chunk.id).toBe(false);
			if (full.statics.some((part) => /<(?:p|aside)[\s>]/.test(part)))
				expect(rendered, chunk.id).toBe(true);
		}
	},
);

test('a module whose only use of imported data is fixed markup ships no import of it', async () => {
	const { compiled, served } = await compile(
		'Figure',
		`import { state } from '@markless/core';
import { art } from './figure.art.ts';
export default function Figure() @{
	let beat = state('rest');
	<figure data-beat={beat} onClick={() => (beat = beat === 'rest' ? 'go' : 'rest')}>
		@for (const view of art.views; key view.key) {
			<svg viewBox={'0 0 ' + view.width + ' ' + view.height}>
				@for (const part of view.parts; key part.key) {
					@if (part.key === 'plan') {
						<path class="plan" d={part.d} />
					} @else {
						<path d={part.d} />
					}
				}
			</svg>
		}
	</figure>
}`,
	);
	expect(compiled.publicRenderModule.componentDefinitions.length).toBe(1);
	expect(served.imports).toEqual([]);
	expect(served.readers.Figure ?? '').not.toMatch(/\bart\b/);
	expect(served.browserRenderedEdgeIds).toEqual([]);
	expect(served.browserRenderedComponents).toEqual([]);
});

test('a child placed where the browser renders is named, so its full render data ships', async () => {
	const { compiled, served } = await compile(
		'Board',
		`import { state } from '@markless/core';
import Card from './card.tsrx';
import Badge from './badge.tsrx';
export default function Board() @{
	let cards = state([{ id: 'a' }]);
	<main>
		<Badge />
		@for (const card of cards; key card.id) {
			<Card id={card.id} />
		}
	</main>
}`,
	);
	const edgeOf = (child: string) =>
		compiled.semanticGraph.componentEdges.find((edge) => edge.childComponentName === child)?.id;
	expect(served.browserRenderedEdgeIds).toEqual([edgeOf('Card')]);
	expect(served.browserRenderedEdgeIds).not.toContain(edgeOf('Badge'));
});
