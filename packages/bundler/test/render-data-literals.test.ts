import { expect, test } from 'vitest';
import { transformTsrxModule } from '../src/transform.ts';

export const familySource = (
	name: string,
	tag: string,
) => `import { state, computed } from '@markless/core';
export function ${name}({start = 2}) @{
 let value=state(start); const doubled=computed(()=>value*2);
 <${tag} onClick={()=>value++}>{doubled}</${tag}>
}
export function ${name}Label({label='label'}) @{
 let value=state('label');
 <span>{value}</span>
}
export default function ${name}Page() @{
 <main><${name} start={3}/><${name} start={5}/><${name}Label label="first"/><${name}Label label="second"/></main>
}`;

test.each([
	{ name: 'Meter', tag: 'output' },
	{ name: 'Count', tag: 'p' },
])(
	'factors repeated state/view literals for $name without sharing objects',
	async ({ name, tag }) => {
		const result = await transformTsrxModule({
			filename: `/workspace/${name}.tsrx`,
			environment: 'client',
			source: familySource(name, tag),
		});
		const data = result.virtualModules.find((module) => module.type === 'render-data')!.source;
		expect(data).toMatch(/function marklessRenderLiteral\d+\(\)/);
	},
);

import { factorRenderDataLiterals } from '../src/render-data-literals.ts';
import { jsonSourceWithNonFiniteNumbers } from '@markless/serializer';
import { renderPrerenderDataSurface } from '../../web/src/prerender/evaluator.ts';
const evaluate = (records: string[], factories: string[]) =>
	new Function(`${factories.join('\n')}return [${records.join(',')}];`)();

test('factories preserve values, ordered fields, nonfinite numbers and independent nested identity', () => {
	const common = {
		cells: [
			{ name: 'value', initial: { nested: ['escaped " quote', Infinity, -Infinity, NaN] } },
		],
		padding: 'repeat'.repeat(40),
	};
	const records = [
		{ name: 'First', state: common, view: common, cellIndexes: [0], extra: undefined },
		{ name: 'Second', state: common, view: common, cellIndexes: [1], empty: null },
	].map((record) => jsonSourceWithNonFiniteNumbers(record)!);
	const result = factorRenderDataLiterals(records, '');
	expect(result.factories.length).toBe(1);
	const values = evaluate(result.records, result.factories),
		before = evaluate(records, []);
	expect(values).toEqual(before);
	expect(values.map(Object.keys)).toEqual(before.map(Object.keys));
	expect(values[0].state).not.toBe(values[1].state);
	expect(values[0].state).not.toBe(values[0].view);
	expect(values[0].state.cells[0].initial.nested).not.toBe(
		values[1].state.cells[0].initial.nested,
	);
	values[0].state.cells[0].initial.nested[0] = 'changed';
	expect(values[1].state.cells[0].initial.nested[0]).toBe('escaped " quote');
	expect(values[0].view.cells[0].initial.nested[0]).toBe('escaped " quote');
});
test('keeps distinct values, singleton modules, small and empty values inline', () => {
	for (const records of [
		[],
		['{}'],
		['{"state":{}}', '{"state":{}}'],
		['{"state":{"value":1}}', '{"state":{"value":2}}'],
	])
		expect(factorRenderDataLiterals(records, '')).toEqual({ records, factories: [] });
});
test('avoids authored import/declaration names including escaped identifiers', () => {
	const state = { values: ['x'.repeat(200)] };
	const records = [JSON.stringify({ state }), JSON.stringify({ state })];
	const result = factorRenderDataLiterals(
		records,
		'import { x as marklessRenderLiteral0 } from "./x.js";const marklessRenderLiteral\\u0031=0;',
	);
	expect(result.factories[0]).toMatch(/^function marklessRenderLiteral2\(/);
	expect(evaluate(result.records, result.factories)).toEqual(evaluate(records, []));
});

test.each([
	{ name: 'Meter', tag: 'output' },
	{ name: 'Count', tag: 'p' },
])('executes independent $name instances in client render data', async ({ name, tag }) => {
	const moduleUrl = (source: string) =>
		`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
	const outputs = [];
	for (const prerenderRecords of [false, true]) {
		const result = await transformTsrxModule({
			filename: `/workspace/${name}.tsrx`,
			environment: 'client',
			prerenderRecords,
			source: familySource(name, tag),
		});
		let source = result.virtualModules.find((module) => module.type === 'render-data')!.source;
		for (const symbol of result.manifest.symbols.filter(
			(symbol) =>
				symbol.kind === 'state-initializer' || symbol.kind === 'sync-computed-derive',
		)) {
			const module = result.virtualModules.find(
				(module) => module.id === symbol.virtualModuleId,
			)!;
			source = source.replace(
				JSON.stringify(module.id),
				JSON.stringify(moduleUrl(module.source)),
			);
		}
		const { marklessPrerenderData } = await import(moduleUrl(source));
		const definitions = Object.values(marklessPrerenderData.components) as Array<{
			state: unknown;
			view: unknown;
		}>;
		expect(definitions[0]!.state).not.toBe(definitions[1]!.state);
		expect(definitions[0]!.view).not.toBe(definitions[1]!.view);
		const output = await renderPrerenderDataSurface(
			{ ...marklessPrerenderData, rootComponentName: name + 'Page' },
			(id) => {
				throw Error('Unexpected lazy symbol request ' + id);
			},
			{},
		);
		expect(output.html).toContain('>6</' + tag + '>');
		expect(output.html).toContain('>10</' + tag + '>');
		expect(output.html.match(/>label<\/span>/g)).toHaveLength(2);
		outputs.push(output.html);
	}
	expect(outputs).toHaveLength(2);
	expect(outputs[0]).toBe(outputs[1]);
});

test.each([
	{ name: 'Meter', tag: 'output' },
	{ name: 'Count', tag: 'p' },
])(
	'preserves ordinary $name server-root compatibility',
	async ({ name, tag }) => {
		const { createServer } = await import('vite');
		const { markless } = await import('../src/vite/index.ts');
		const { renderToString } = await import('@markless/web');
		const id = '/literal-factoring-' + name + '.tsrx';
		const source = familySource(name, tag);
		const server = await createServer({
			root: new URL('..', import.meta.url).pathname,
			configFile: false,
			logLevel: 'error',
			appType: 'custom',
			server: { middlewareMode: true },
			plugins: [
				{
					name: 'render-literal-fixture',
					resolveId(candidate) {
						return candidate === id ? '\0' + id : null;
					},
					load(candidate) {
						return candidate === '\0' + id ? source : null;
					},
				},
				markless() as never,
			],
		});
		try {
			const module = await server.ssrLoadModule(id);
			const rootHtml = await renderToString(module.default, { executionLog: 'never' });
			// `module.default` is the page, not the first named export above it.
			expect(rootHtml).toContain('<main>');
			expect(rootHtml).toContain('>6</' + tag + '>');
			expect(rootHtml).toContain('>10</' + tag + '>');
			expect(rootHtml).not.toContain('>4</' + tag + '>');
		} finally {
			await server.close();
		}
	},
	30000,
);
