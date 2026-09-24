import { expect, test } from 'vitest';
import type { RuntimeDemandMapArtifact } from '@markless/compiler';
import { emitScalarPlanLoader } from '../src/scalar-plan-loader.ts';
import { marklessClient } from '../src/rolldown.ts';
import { transformTsrxModule } from '../src/transform.ts';
import { callBuildStart, callTransform } from './helpers.ts';

test('emits no namespace export for a leaf with no scalar action', () => {
	expect(emitScalarPlanLoader([], [])).toBe('');
});
test.each([
	{
		name: 'Meter',
		cell: 'count',
		body: '<button onClick={() => count++}>Count: {count} units</button>',
	},
	{
		name: 'Score',
		cell: 'total',
		body: '<section><output>Score: {total} points</output><button onClick={() => total++}>Add</button></section>',
	},
])(
	'$name metadata is requested independently of ordinary symbol output',
	async ({ name, cell, body }) => {
		const filename = `/workspace/app/${name}.tsrx`;
		const source = `import { state } from '@markless/core'; export default function ${name}() @{ let ${cell} = state(0); ${body} }`;
		for (const order of [
			[false, true, false],
			[true, false, true],
		]) {
			const plugin = marklessClient({ executionLog: 'never' });
			callBuildStart(plugin, { cwd: '/workspace/app' });
			for (const requested of order) {
				const id = `${filename}?markless-symbols${requested ? '&markless-scalar-plans' : ''}`;
				const result = (await callTransform(plugin, source, id)) as { code: string };
				expect(result.code.includes('export function loadScalarActionPlan(')).toBe(
					requested,
				);
				expect(result.code).toContain('export { loadSymbol };');
			}
		}
	},
);

test('nested metadata and handler routes request the same child module variant', async () => {
	const child = await transformTsrxModule({
		filename: '/src/Leaf.tsrx',
		source: `import { state } from '@markless/core'; export default function Leaf() @{ let value = state(0); <button onClick={() => value++}>{value}</button> }`,
		environment: 'client',
	});
	const parent = await transformTsrxModule({
		filename: '/src/Parent.tsrx',
		source: `import Leaf from './Leaf.tsrx'; export default function Parent() @{ <aside><Leaf /></aside> }`,
		environment: 'client',
		clientOutput: 'symbols-only',
		includeScalarActionPlans: true,
		importedModuleInterfaces: { './Leaf.tsrx': child.moduleGraphInterface },
	});
	const imports: string[] = [];
	const read = new Function(
		'loadModule',
		parent.code
			.replace(/export\s*\{[^}]+\};?/g, '')
			.replace(/export /g, '')
			.replace(/\bimport\(/g, 'loadModule(') +
			'\nreturn {loadSymbol:marklessSsrLoadSymbolRoute,loadScalarActionPlan};',
	);
	const loaders = read(async (id: string) => {
		imports.push(id);
		return { loadSymbol: () => 'handler', loadScalarActionPlan: () => ({ scope: '' }) };
	});
	expect(await loaders.loadSymbol('c0:symbol:0')).toBe('handler');
	expect(await loaders.loadScalarActionPlan('c0:symbol:0')).toEqual({ scope: 'c0:' });
	expect(imports).toEqual([
		'./Leaf.tsrx?markless-symbols&markless-scalar-plans',
		'./Leaf.tsrx?markless-symbols&markless-scalar-plans',
	]);
});

const actions = [
	{
		hostNodeId: 'h7',
		eventName: 'click',
		recordKind: 'event',
		recordKinds: ['event', 'dom-update'],
		payloadRecordIds: [],
		runtimeModuleIds: [],
		plan: {
			version: 1,
			kind: 'scalar',
			symbolId: 'symbol:4',
			cell: 'state:units',
			write: { kind: 'update', updateOperator: '++' },
			textUpdates: [
				{
					hostNodeId: 'h9',
					graphNodeId: 'state:units',
					symbolId: 'symbol:5',
					prefix: 'Units: ',
					suffix: ' total',
				},
			],
		},
	},
] satisfies RuntimeDemandMapArtifact['actions'];

function load(
	source: string,
	importer: (id: string) => Promise<unknown> = async () => {
		throw new Error('Unexpected import');
	},
) {
	return new Function(
		'loadModule',
		source.replace(/export /g, '').replace(/\bimport\(/g, 'loadModule(') +
			'\nreturn loadScalarActionPlan;',
	)(importer);
}

test('reads compiler scalar metadata without evaluating an action module', async () => {
	const loader = load(emitScalarPlanLoader(actions, []));
	expect(await loader('symbol:4')).toEqual({
		hostNodeId: 'h7',
		eventName: 'click',
		scope: '',
		plan: actions[0].plan,
	});
	expect(await loader('symbol:missing')).toBeUndefined();
});

test('routes nested child metadata without replacing local coordinates', async () => {
	const imports: string[] = [];
	const leaf = load(emitScalarPlanLoader(actions, []));
	const wrapper = load(
		emitScalarPlanLoader([], [{ prefix: 'c2:', importSource: './leaf.tsrx?markless-symbols' }]),
		async (id) => {
			imports.push(id);
			return { loadScalarActionPlan: leaf };
		},
	);
	const parent = load(
		emitScalarPlanLoader(
			[],
			[{ prefix: 'c1:', importSource: './wrapper.tsrx?markless-symbols' }],
		),
		async (id) => {
			imports.push(id);
			return { loadScalarActionPlan: wrapper };
		},
	);
	expect(await parent('c1:c2:symbol:4')).toEqual({
		hostNodeId: 'h7',
		eventName: 'click',
		scope: 'c1:c2:',
		plan: actions[0].plan,
	});
	expect(imports).toEqual(['./wrapper.tsrx?markless-symbols', './leaf.tsrx?markless-symbols']);
});

test('self routes and a longer imported prefix keep their ownership', async () => {
	const imports: string[] = [];
	const loader = load(
		emitScalarPlanLoader(actions, [
			{ prefix: 'c1:', self: true },
			{ prefix: 'c1:c3:', importSource: './other.tsrx?markless-symbols' },
		]),
		async (id) => {
			imports.push(id);
			return {};
		},
	);
	expect((await loader('c1:c1:symbol:4')).scope).toBe('c1:c1:');
	expect(await loader('c1:c3:symbol:4')).toBeUndefined();
	expect(imports).toEqual(['./other.tsrx?markless-symbols']);
});

test.each(['Units', 'Score'])(
	'compiled %s symbol modules expose facts without changing prerender routing',
	async (name) => {
		const transformed = await transformTsrxModule({
			filename: `/src/${name}.tsrx`,
			source: `import { state } from '@markless/core'; export default function ${name}() @{ let value = state(0); <button onClick={() => value++}>Value: {value} units</button> }`,
			environment: 'client',
			clientOutput: 'symbols-only',
			includeScalarActionPlans: true,
			runtimeDemandClass: 'prerender',
			executionLog: 'never',
		});
		const source = /export function loadScalarActionPlan\(symbolId\) \{[\s\S]*?\n\}/.exec(
			transformed.code,
		)?.[0];
		expect(source).toBeDefined();
		const symbolId = /symbolId === "([^"]+)"/.exec(source!)?.[1];
		expect(symbolId).toBeDefined();
		expect(await load(source!)(symbolId)).toMatchObject({
			scope: '',
			eventName: 'click',
			plan: { cell: 'state:value', textUpdates: [{ prefix: 'Value: ', suffix: ' units' }] },
		});
		expect(transformed.manifest.runtimeDemandMap.actions[0]?.plan).toBeUndefined();
		expect(transformed.code).not.toContain('state as payloadState');
	},
);
