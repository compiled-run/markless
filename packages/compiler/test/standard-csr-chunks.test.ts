import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/compile-module.ts';

test('T009b standard CSR emits a renderData chunk bootstrap without component-body execution', async () => {
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

	const source = result.publicRenderModule.csrModuleSource;
	expect(source).toContain('createMarklessCsrChunkRenderer');
	expect(source).toContain('template:App');
	expect(source).toContain('child-component');
	expect(source).not.toContain('__marklessBodyExecuted = true');
	expect(source).not.toContain('marklessCsrComposeView');
	expect(source).not.toContain('.renderCsr?.(');
});

test('T009b standard CSR exports component chunk data for parent modules', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Card.tsrx',
		source: `export function Card({ title }) @{ <article><h2>{title}</h2></article> }`,
		symbols: [],
	});

	expect(result.publicRenderModule.csrModuleSource).toContain(
		'export const marklessCsrChunkComponents',
	);
	expect(result.publicRenderModule.csrModuleSource).toContain('template:Card');
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

	expect(result.publicRenderModule.csrModuleSource).toContain('"hostPrefix":"c0:"');
	expect(result.publicRenderModule.csrModuleSource).toContain('"hostPrefix":"c1:"');
	expect(result.publicRenderModule.csrModuleSource).not.toContain('"hostPrefix":"c3:"');
});
