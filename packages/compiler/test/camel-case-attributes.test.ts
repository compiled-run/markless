import { expect, test } from 'vitest';
import { buildSemanticGraph, compileTsrxModule } from '../src/index.ts';

async function graphOf(source: string) {
	return await buildSemanticGraph({ filename: 'src/Camel.tsrx', source });
}

const statics = (graph: Awaited<ReturnType<typeof graphOf>>) =>
	graph.markup.chunks.map((chunk) => chunk.statics.join('')).join('');

test('static camelCase SVG and HTML attributes are written with their real names', async () => {
	const graph = await graphOf(`export function Icon() @{
	<form acceptCharset="utf-8">
		<meta httpEquiv="refresh" content="5" />
		<input readOnly tabIndex={0} maxLength={3} />
		<svg viewBox="0 0 24 24" xmlnsXlink="http://www.w3.org/1999/xlink">
			<line strokeWidth={4} strokeLinecap="round" fillOpacity="0.5" x1="0" y1="0" x2="24" y2="24" />
			<use xlinkHref="#dot" />
		</svg>
	</form>
}`);
	const html = statics(graph);
	expect(html).toContain('<form accept-charset="utf-8">');
	expect(html).toContain('<meta http-equiv="refresh" content="5">');
	expect(html).toContain('<input readonly="" tabindex="0" maxlength="3">');
	expect(html).toContain('<svg viewBox="0 0 24 24" xmlns:xlink="http://www.w3.org/1999/xlink">');
	expect(html).toContain(
		'<line stroke-width="4" stroke-linecap="round" fill-opacity="0.5" x1="0" y1="0" x2="24" y2="24">',
	);
	expect(html).toContain('<use xlink:href="#dot">');
	expect(graph.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
});

test('dynamic camelCase attributes bind their real names, in the template and in an @if arm', async () => {
	const graph = await graphOf(`import { state } from '@markless/core';
export function Chart() @{
	let width = state(2);
	let shown = state(false);
	<>
		<svg>
			<path d="M0 0" strokeWidth={width} />
			@if (shown) {
				<circle r="1" fillOpacity={width} />
			}
		</svg>
		<button tabIndex={width} onClick={() => (shown = !shown)}>x</button>
	</>
}`);
	const names = graph.markup.chunks.flatMap((chunk) =>
		chunk.slots.flatMap((slot) => (slot.kind === 'attribute' ? [slot.name] : [])),
	);
	expect(names).toEqual(expect.arrayContaining(['stroke-width', 'fill-opacity', 'tabindex']));
	expect(names).not.toEqual(expect.arrayContaining(['strokeWidth']));
	expect(names).not.toContain('fillOpacity');
	expect(names).not.toContain('tabIndex');
});

test('a camelCase name on a component is a prop and keeps its spelling', async () => {
	const graph = await graphOf(`function Line({ strokeWidth }) @{ <line stroke-width={strokeWidth} /> }
export function App() @{ <Line strokeWidth={3} /> }`);
	expect(JSON.stringify(graph.componentEdges)).toContain('strokeWidth');
	expect(JSON.stringify(graph.componentEdges)).not.toContain('stroke-width');
});

test('className and htmlFor are React renames, not spellings, and are written as typed', async () => {
	const graph = await graphOf(`export function App() @{ <label htmlFor="a" className="b">x</label> }`);
	expect(statics(graph)).toContain('<label htmlFor="a" className="b">');
});

test('writing one attribute in both spellings on one element is a build error', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Camel.tsrx',
		source: `export function App() @{ <svg><line strokeWidth={4} stroke-width="2" /></svg> }`,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
	const duplicate = result.semanticGraph.diagnostics.find(
		(diagnostic) => diagnostic.code === 'MARKLESS_ATTRIBUTE_DUPLICATE',
	);
	expect(duplicate).toMatchObject({ severity: 'error' });
	expect(duplicate?.message).toContain('strokeWidth');
	expect(duplicate?.message).toContain('stroke-width');
});

test('only a module that spreads attributes hands the renderer the camelCase name table', async () => {
	const compile = (source: string) =>
		compileTsrxModule({
			filename: 'src/Camel.tsrx',
			source,
			buildId: 'build',
			resolverId: 'resolver',
			symbols: [],
		});
	const spreading = await compile(
		`export function Line(props: Record<string, unknown>) @{ <svg><line {...props} /></svg> }`,
	);
	expect(spreading.publicRenderModule.ssrModuleSource).toContain(
		"import { marklessAttributeName } from '@markless/web/fns/attribute-name';",
	);
	expect(spreading.publicRenderModule.ssrModuleSource).toContain(
		'attributeName:marklessAttributeName,',
	);
	expect(spreading.publicRenderModule.componentDefinitions[0]).toMatchObject({
		spreadsAttributes: true,
	});
	const plain = await compile(`export function Line() @{ <svg><line strokeWidth={4} /></svg> }`);
	expect(plain.publicRenderModule.ssrModuleSource).not.toContain('marklessAttributeName');
	expect(plain.publicRenderModule.componentDefinitions[0]).not.toHaveProperty('spreadsAttributes');
});
