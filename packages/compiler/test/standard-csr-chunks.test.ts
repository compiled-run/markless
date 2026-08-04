import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/compile-module.ts';

test('linked render data publishes component definitions without component-body execution', async () => {
	const result = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source: `
import { state } from '@markless/core';
import { Card } from './Card.tsrx';

export function App() @{
	globalThis.__marklessBodyExecuted = true;
	let title = state('Ready');
	<main><Card title={title} /><p>{title}</p></main>
}
`,
		symbols: [],
	});

	const definitions = JSON.stringify(result.publicRenderModule.componentDefinitions);
	expect(definitions).toContain('template:App');
	expect(definitions).toContain('component-edge:0');
	expect(definitions).not.toContain('__marklessBodyExecuted = true');
	expect(result.publicRenderModule).not.toHaveProperty('csrModuleSource');
	expect(result.publicRenderModule).not.toHaveProperty('csrNativeMarkup');
});

test('non-materialized InteractiveCounter keeps its linked component definition', async () => {
	const result = await compileTsrxModule({
		filename: 'src/InteractiveCounter.tsrx',
		source: `import { state } from '@markless/core';
		import { Link } from '@markless/core/router';
export default function InteractiveCounter() @{
	let count = state(0);
	<section>
		<button data-mdx-counter onClick={() => count++}>MDX Count {count}</button>
		<Link href="/" data-router-home>Home</Link>
	</section>
}`,
		symbols: [],
	});

	const registryKey = result.renderData.root?.componentName;
	expect(registryKey).toBe('InteractiveCounter');
	const definitionData = result.publicRenderModule.componentDefinitions.find(
		(definition) => definition.name === registryKey,
	) as {
		readonly name: string;
		readonly rootChunkId: string;
		readonly chunks: ReadonlyArray<Readonly<Record<string, unknown>>>;
	};
	expect(definitionData.name).toBe('InteractiveCounter');
	expect(definitionData.rootChunkId).toBe(result.renderData.root?.templateId);
	for (const [index, renderChunk] of result.renderData.chunks.entries()) {
		const definitionChunk = definitionData.chunks[index];
		const { statics: _statics, ...nativeChunkShape } = renderChunk;
		expect(definitionChunk).toEqual({
			...nativeChunkShape,
			nativeTemplateId: `markless-render-data:src%2FInteractiveCounter.tsrx:InteractiveCounter:template:${encodeURIComponent(renderChunk.id)}`,
		});
		expect(definitionChunk).not.toHaveProperty('statics');
	}
});

test('direct-eligible child modules publish prerender component definitions without changing tiers', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Badge.tsrx',
		source: `export function Badge() @{ <strong>Ready</strong> }`,
		symbols: [],
	});

	expect(result.publicRenderModule.moduleSource).not.toBe('');
	expect(result.publicRenderModule.componentDefinitions).toEqual([
		expect.objectContaining({
			name: 'Badge',
			rootChunkId: 'template:Badge',
		}),
	]);
});

test('linked component definitions export chunk data for parent modules', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Card.tsrx',
		source: `export function Card({ title }) @{ <article><h2>{title}</h2></article> }`,
		symbols: [],
	});

	expect(JSON.stringify(result.publicRenderModule.componentDefinitions)).toContain('template:Card');
});

test('artifact children materialized at build time are data, never runtime component registry entries', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Page.tsrx',
		source: `import { Link } from '@markless/core/router';
export function Page() @{ <main><Link href="/docs">Docs</Link></main> }`,
		symbols: [],
		artifactChildMaterializations: {
			'component-edge:0': {
				html: '<a href="/docs" data-markless-router-link>Docs</a>',
				elementCount: 1,
			},
		},
	});

	const definitions = JSON.stringify(result.publicRenderModule.componentDefinitions);
	expect(definitions).toContain('data-markless-router-link');
	expect(definitions).not.toContain('renderCsr');
});

test('T009b chunk statics preserve slot-adjacent text bytes', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Counter.tsrx',
		source: `import { state } from '@markless/core';
export function Counter() @{
	let count = state(6);
	<p data-count>Weighted count {count} total</p>
}`,
		symbols: [],
	});

	const chunk = result.renderData.chunks.find((candidate) => candidate.id === 'template:Counter');
	expect(chunk?.statics).toEqual([
		'<p data-count="">Weighted count <!--markless-slot:0-->',
		' total</p>',
	]);
});

test('T009b component scopes keep the canonical c0/c1 route ids used by execution attribution', async () => {
	const result = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source: `
import { First } from './First.tsrx';
import { Second } from './Second.tsrx';
export function App() @{ <main><First /><Second /></main> }
`,
		symbols: [],
	});

	const definitions = JSON.stringify(result.publicRenderModule.componentDefinitions);
	expect(definitions).toContain('"hostPrefix":"c0:"');
	expect(definitions).toContain('"hostPrefix":"c1:"');
	expect(definitions).not.toContain('"hostPrefix":"c3:"');
});

test('canonical render data transports statics and slot tables without a browser producer', async () => {
	const result = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source: `import { state } from '@markless/core';
import { Card } from './Card.tsrx';
export function App() @{
	let title = state('Native');
	<main><Card title={title} /><h1>{title}</h1><button onClick={() => title = 'Changed'}>change</button></main>
}`,
		symbols: [],
	});

	expect(result.publicRenderModule.renderDataModuleSource).toContain(
		'export const marklessRenderData',
	);
	expect(result.publicRenderModule).not.toHaveProperty('csrModuleSource');
	expect(result.publicRenderModule).not.toHaveProperty('csrNativeMarkup');
});

test('T009d callback bodies have one demand-loaded symbol representation', async () => {
	const result = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source: `import { Child } from './Child.tsrx';
export function App() @{
	<main><Child onPick={() => globalThis.__picked = true} /></main>
}`,
		symbols: [],
	});

	expect(
		JSON.stringify(result.publicRenderModule.componentDefinitions).match(
			/globalThis\.__picked/g,
		) ?? [],
	).toHaveLength(0);
	expect(
		result.symbolModules.modules.some((module) =>
			module.source.includes('globalThis.__picked'),
		),
	).toBe(true);
});
