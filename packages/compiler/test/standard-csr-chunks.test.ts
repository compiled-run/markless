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
	const native = nativePayload(source);
	expect(source).toContain('createMarklessCsrChunkRenderer');
	expect(native).toContain('template:App');
	expect(native).toContain('child-component');
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
	expect(nativePayload(result.publicRenderModule.csrModuleSource)).toContain('template:Card');
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

	const native = nativePayload(result.publicRenderModule.csrModuleSource);
	expect(native).toContain('"hostPrefix":"c0:"');
	expect(native).toContain('"hostPrefix":"c1:"');
	expect(native).not.toContain('"hostPrefix":"c3:"');
});

test('T009d standard CSR transports statics and slot tables as inert native markup data', async () => {
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

	const source = result.publicRenderModule.csrModuleSource;
	expect(source).toContain('MARKLESS_CSR_NATIVE_START');
	expect(source).toContain('dataId:');
	expect(source).not.toContain('chunks:[{');
	expect(source).not.toContain('initialValues:[{');
	expect(source).not.toContain('template.innerHTML');
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

	const source = result.publicRenderModule.csrModuleSource;
	expect(source.match(/globalThis\.__picked/g) ?? []).toHaveLength(0);
	expect(result.symbolModules.modules.some((module) => module.source.includes('globalThis.__picked'))).toBe(true);
});

function nativePayload(source: string): string {
	const encoded = /MARKLESS_CSR_NATIVE_START:([\s\S]*?):MARKLESS_CSR_NATIVE_END/.exec(source)?.[1];
	if (!encoded) throw new Error('Expected native CSR payload marker.');
	return decodeURIComponent(encoded);
}
