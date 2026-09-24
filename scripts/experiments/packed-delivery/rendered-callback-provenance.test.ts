import { afterEach, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	createCallbackProbe,
	instrumentCallbackProvenance,
} from './rendered-callback-provenance.mjs';
import { marklessInvokeCallbackSlot } from '../../../packages/web/src/fns/callback-slot.ts';

const probeKey = '__marklessRenderedCallbackProbe';
afterEach(() => {
	delete (globalThis as Record<string, unknown>)[probeKey];
});

function execute(source: string) {
	const probe = createCallbackProbe();
	(globalThis as Record<string, unknown>)[probeKey] = probe;
	const result = instrumentCallbackProvenance(source);
	const functions = new Function(
		`${result.source};return {marklessSsrCallbackSlot,composeMdxState};`,
	)();
	return { probe, functions, result };
}

const fixture = (params: string[]) => `
function marklessSsrCallbackSlot(${params.join(',')}) {
 const cell = ${params[0]}.cells.find(entry => entry.graphNodeId === ${params[1]});
 if (cell && ${params[2]} !== undefined) Object.assign(cell,{value:undefined,directValue:${params[2]}});
}
function composeMdxState(children) {
 return {cells:children.flatMap(child => child.output.state.cells.map(cell => ({...cell,graphNodeId:child.symbolPrefix+cell.graphNodeId})))};
}`;

test.each([
	['state', 'graphNodeId', 'symbolId'],
	['payload', 'node', 'answer'],
])(
	'records compiler-selected callback slots with %s parameters and preserves composition output',
	(...params) => {
		const source = fixture(params);
		const plain = new Function(`${source};return {marklessSsrCallbackSlot,composeMdxState};`)();
		const { probe, functions, result } = execute(source);
		expect(result.instrumented).toEqual(['marklessSsrCallbackSlot', 'composeMdxState']);
		const make = () => ({
			cells: [
				{ graphNodeId: 'c2:shared:box/callback', directValue: undefined },
				{ graphNodeId: 'state:user', directValue: 'symbol:fake' },
			],
		});
		const plainState = make();
		const tracedState = make();
		plain.marklessSsrCallbackSlot(
			plainState,
			plainState.cells[0].graphNodeId,
			'symbol:changed',
		);
		functions.marklessSsrCallbackSlot(
			tracedState,
			tracedState.cells[0].graphNodeId,
			'symbol:changed',
		);
		const child = (state: unknown) => [{ symbolPrefix: 'm4:', output: { state } }];
		const before = plain.composeMdxState(child(plainState));
		const after = functions.composeMdxState(child(tracedState));
		expect(JSON.stringify(after)).toBe(JSON.stringify(before));
		expect(probe.renders).toEqual([
			{
				callbacks: [
					{ graphNodeId: 'm4:c2:shared:box/callback', symbolId: 'symbol:changed' },
				],
				unknownCells: [],
				prefixes: ['m4:'],
			},
		]);
	},
);

test('distinguishes absent callbacks from unmarked values without using graph ID spelling', () => {
	const { probe, functions } = execute(fixture(['s', 'g', 'v']));
	const state = {
		cells: [
			{ graphNodeId: 'c7:arbitrary', valueKind: 'unknown' },
			{
				graphNodeId: 'shared:box/slot:onChange',
				valueKind: 'unknown',
				directValue: 'symbol:fake',
			},
		],
	};
	functions.marklessSsrCallbackSlot(state, 'c7:arbitrary', undefined);
	functions.marklessSsrCallbackSlot(state, 'missing', undefined);
	functions.composeMdxState([{ symbolPrefix: 'm8:', output: { state } }]);
	expect(probe.renders[0]).toEqual({
		callbacks: [{ graphNodeId: 'm8:c7:arbitrary', symbolId: undefined }],
		unknownCells: ['m8:shared:box/slot:onChange'],
		prefixes: ['m8:'],
	});
});

test.each([
	['m4:c3:shared:widget/callback', 'symbol:change', 'm4:symbol:change'],
	['m7:c2:c8:p4:r:row:shared:widget/callback', 'symbol:change', 'm7:c2:symbol:change'],
	['m3:c2:shared:widget/callback', 'm9:c1:symbol:external', 'm9:c1:symbol:external'],
])(
	'resolves the rendered callback through the owning dispatch helper: %s',
	(graphNodeId, symbolId, expected) => {
		const invocations: string[] = [];
		marklessInvokeCallbackSlot(
			{ graph: { read: () => symbolId }, invokeSymbol: (id) => invocations.push(id) },
			graphNodeId,
			[],
		);
		expect(invocations).toEqual([expected]);
	},
);

test('instruments the actual SSR helper without retaining markers in serialized state', () => {
	const source = readFileSync(
		new URL('../../../packages/web/src/fns/ssr.ts', import.meta.url),
		'utf8',
	);
	const start = source.indexOf('export function marklessSsrCallbackSlot(');
	const end = source.indexOf('export function marklessSsrCallbackSymbol(', start);
	const helper = source
		.slice(start, end)
		.replace('export ', '')
		.replace('state: ComposeStateDraft', 'state')
		.replace('graphNodeId: string', 'graphNodeId')
		.replace('symbolId: string | undefined', 'symbolId');
	const { probe, functions } = execute(
		helper +
			fixture(['a', 'b', 'c']).slice(
				fixture(['a', 'b', 'c']).indexOf('function composeMdxState'),
			),
	);
	const state = { cells: [{ graphNodeId: 'c1:shared:x/value', valueKind: 'unknown' }] };
	functions.marklessSsrCallbackSlot(state, state.cells[0].graphNodeId, 'symbol:answer');
	const composed = functions.composeMdxState([{ symbolPrefix: 'm6:', output: { state } }]);
	expect(Object.getOwnPropertySymbols(composed.cells[0])).toHaveLength(1);
	expect(
		Object.getOwnPropertySymbols(JSON.parse(JSON.stringify(composed)).cells[0]),
	).toHaveLength(0);
	expect(probe.renders[0].callbacks).toEqual([
		{ graphNodeId: 'm6:c1:shared:x/value', symbolId: 'symbol:answer' },
	]);
});

test('refuses an unexpected compiler helper shape', () => {
	expect(() =>
		instrumentCallbackProvenance('function marklessSsrCallbackSlot({cells}){}'),
	).toThrow(/parameters/);
});
