import { expect, test } from 'vitest';
import {
	assertDemandMapMatchesEmittedSymbolImports,
	deriveAllowedModules,
	forbiddenExecutedModules,
} from '../test-support/execution-expectations.ts';
import { transformTsrxModule } from '../src/transform.ts';

test('expectations derive allowed runtime modules from the generated demand map', async () => {
	const result = await transformTsrxModule({
		filename: '/workspace/app/Counter.tsrx',
		source: `
			import { state } from '@markless/core';
			export function Counter() @{
				let count = state(0);
				<button onClick={() => count++}>{count}</button>
			}
		`,
		executionLog: 'always',
	});
	const payload = payloadView(result.virtualModules.find((module) => module.type === 'payload')?.source);
	const click = payload.events[0];
	const allowed = deriveAllowedModules(payload, {
		hostNodeId: click.hostNodeId,
		eventName: click.eventName,
		executionLog: true,
	});

	expect(() =>
		assertDemandMapMatchesEmittedSymbolImports(result.virtualModules, payload.runtimeDemandMap),
	).not.toThrow();
	expect(allowed).toContain('web/fns/write-scalar');
	expect(allowed).toContain('web/fns/update-text');
	expect(allowed).toContain('web/event-only-resume');
	expect(allowed).toContain('web/execution-log-target');
	expect(allowed).not.toContain('web/dom-journal');
});

test('generated demand map carries per-kind replacement phase flags', async () => {
	const { payload } = await counterPayload();

	expect(payload.runtimeDemandMap.recordKinds).toEqual(
		['async-boundary', 'behavior', 'branch', 'dom-update', 'element-handle', 'event', 'keyed-repeat']
			.map((kind) => ({ kind, replaced: false })),
	);
});

test('unreplaced action kinds allow the structurally derived interpreter chain', async () => {
	const { payload } = await counterPayload();
	const click = payload.events[0];
	const allowed = deriveAllowedModules(payload, {
		hostNodeId: click.hostNodeId,
		eventName: click.eventName,
	});

	expect([...allowed].filter((id) => JUDGE_COUNTER_INTERPRETER_CHAIN_SET.has(id)).sort())
		.toEqual([...JUDGE_COUNTER_INTERPRETER_CHAIN].sort());
});

test('replaced action kinds tighten back to the exact demand set', async () => {
	const { payload } = await counterPayload();
	const click = payload.events[0];
	const replacedPayload = {
		...payload,
		runtimeDemandMap: {
			...payload.runtimeDemandMap,
			recordKinds: payload.runtimeDemandMap.recordKinds.map((kind: any) => ({
				...kind,
				replaced: true,
			})),
		},
	};
	const allowed = deriveAllowedModules(replacedPayload, {
		hostNodeId: click.hostNodeId,
		eventName: click.eventName,
	});

	expect(allowed).toContain('web/fns/write-scalar');
	expect(allowed).toContain('web/fns/update-text');
	expect([...allowed].filter((id) => JUDGE_COUNTER_INTERPRETER_CHAIN_SET.has(id))).toEqual([]);
});

test('wrong demand map entries fail expectations and emitted-equals-required', async () => {
	const result = await transformTsrxModule({
		filename: '/workspace/app/Counter.tsrx',
		source: `
			import { state } from '@markless/core';
			export function Counter() @{
				let count = state(0);
				<button onClick={() => count++}>{count}</button>
			}
		`,
	});
	const payloadModule = result.virtualModules.find((module) => module.type === 'payload');
	const payload = payloadView(payloadModule?.source);
	const click = payload.events[0];
	const missingFromMap = {
		...payload.runtimeDemandMap,
		symbols: payload.runtimeDemandMap.symbols.map((symbol: any) =>
			symbol.runtimeModuleIds.includes('web/fns/write-scalar')
				? { ...symbol, runtimeModuleIds: [] }
				: symbol,
		),
		actions: payload.runtimeDemandMap.actions.map((action: any) => ({
			...action,
			runtimeModuleIds: action.runtimeModuleIds.filter((id: string) => id !== 'web/fns/write-scalar'),
		})),
	};
	const corruptedPayload = { ...payload, runtimeDemandMap: missingFromMap };
	const allowed = deriveAllowedModules(corruptedPayload, {
		hostNodeId: click.hostNodeId,
		eventName: click.eventName,
	});
	const extraInMap = {
		...payload.runtimeDemandMap,
		symbols: payload.runtimeDemandMap.symbols.map((symbol: any, index: number) =>
			index === 0
				? { ...symbol, runtimeModuleIds: [...symbol.runtimeModuleIds, 'web/fns/not-emitted'] }
				: symbol,
		),
	};

	expect(forbiddenExecutedModules(['web/fns/write-scalar'], allowed)).toEqual(['web/fns/write-scalar']);
	expect(() =>
		assertDemandMapMatchesEmittedSymbolImports(result.virtualModules, missingFromMap),
	).toThrow(/extra=\[web\/fns\/write-scalar\]/);
	expect(() =>
		assertDemandMapMatchesEmittedSymbolImports(result.virtualModules, extraInMap),
	).toThrow(/missing=\[web\/fns\/not-emitted\]/);
});

const JUDGE_COUNTER_INTERPRETER_CHAIN = ['web/fns/csr', 'web/fns/html', 'web/fns/state', 'web/inline/sync-policy-core', 'web/payload', 'web/payload-graph-construct', 'web/payload-resume', 'web/resume-events', 'web/resume-runtime', 'web/resume-runtime-shared', 'web/resume-runtime-start'] as const;
const JUDGE_COUNTER_INTERPRETER_CHAIN_SET = new Set<string>(JUDGE_COUNTER_INTERPRETER_CHAIN);

async function counterPayload(): Promise<{ readonly payload: any }> {
	const result = await transformTsrxModule({
		filename: '/workspace/app/Counter.tsrx',
		source: `
			import { state } from '@markless/core';
			export function Counter() @{
				let count = state(0);
				<button onClick={() => count++}>{count}</button>
			}
		`,
	});
	return { payload: payloadView(result.virtualModules.find((module) => module.type === 'payload')?.source) };
}

function payloadView(source: string | undefined): any {
	const match = source?.match(/export const view = ([\s\S]*);\s*$/);
	if (!match) throw new Error('Expected payload virtual module to export view.');
	return JSON.parse(match[1]);
}
