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
	const click = payload.view.events[0];
	const allowed = deriveAllowedModules(payload.view, payload.runtimeDemandMap, {
		hostNodeId: click.hostNodeId,
		eventName: click.eventName,
		executionLog: true,
	});

	expect(() =>
		assertDemandMapMatchesEmittedSymbolImports(result.virtualModules, payload.runtimeDemandMap),
	).not.toThrow();
	expect(allowed).toContain('web/fns/write-scalar');
	expect(allowed).toContain('web/fns/update-text');
	expect(allowed).toContain('web/runtime-error-reporting');
	expect(allowed).not.toContain('web/fns/scalar-core-graph');
	expect(allowed).not.toContain('web/event-only-lean/scalar-core');
	expect(allowed).not.toContain('web/event-only-lean/lean-shared');
	expect(allowed).not.toContain('web/event-only-lean/row');
	expect(allowed).toContain('web/execution-log-target');
	expect(allowed).not.toContain('web/event-only-resume');
	expect(allowed).not.toContain('web/event-only-graph');
	expect(allowed).not.toContain('web/dom-journal');
});

test('generated demand map carries per-kind replacement phase flags', async () => {
	const { payload } = await counterPayload();

	expect(payload.runtimeDemandMap.recordKinds).toEqual(
		['async-boundary', 'behavior', 'branch', 'dom-update', 'element-handle', 'event', 'keyed-repeat']
			.map((kind) => ({ kind, replaced: kind === 'dom-update' || kind === 'event' })),
	);
	expect(payload.runtimeDemandMap.actions[0].payloadRecordIds).toEqual([
		`dom-update:${payload.view.domUpdates[0].hostNodeId}:${payload.view.domUpdates[0].symbolId}`,
		`event:${payload.view.events[0].hostNodeId}:${payload.view.events[0].eventName}`,
	]);
	expect(payload.runtimeDemandMap.actions[0].plan).toMatchObject({
		version: 1,
		kind: 'scalar',
		cell: payload.view.domUpdates[0].graphNodeId,
		symbolId: payload.view.events[0].symbolIds[0],
	});
});

test('alternate-shaped scalar action specializes from locator, cell, event, and text artifacts', async () => {
	const result = await transformTsrxModule({
		filename: '/workspace/app/Alternate.tsrx',
		source: `
			import { state } from '@markless/core';
			export function Alternate() @{
				let tally = state(4);
				<main>
					<input data-anything="yes" onKeyDown={() => tally++} />
					<output>Total: {tally}</output>
				</main>
			}
		`,
	});
	const payload = payloadView(result.virtualModules.find((module) => module.type === 'payload')?.source);
	const resumeSource = result.virtualModules.find((module) => module.type === 'resume')?.source ?? '';
	const event = payload.view.events[0];
	const update = payload.view.domUpdates[0];
	const eventLocator = servedLocator(payload.view.locators.find((locator: any) => locator.hostNodeId === event.hostNodeId));
	const updateLocator = servedLocator(payload.view.locators.find((locator: any) => locator.hostNodeId === update.hostNodeId));
	const allowed = deriveAllowedModules(payload.view, payload.runtimeDemandMap, {
		hostNodeId: event.hostNodeId,
		eventName: event.eventName,
	});

	expect(event.eventName).toBe('keydown');
	expect(payload.runtimeDemandMap.actions[0].plan).toMatchObject({
		kind: 'scalar',
		cell: 'state:tally',
		textUpdates: [expect.objectContaining({ prefix: 'Total: ' })],
	});
	expect(resumeSource).toContain(
		`marklessScalarEventMatches(input, marklessFindElementAtDomOrderIndex(input.root, ${eventLocator.index}, "input"), "keydown", ${JSON.stringify(event.hostNodeId)})`,
	);
	expect(resumeSource).toContain('input.event?.type === eventName');
	expect(resumeSource).toContain(`marklessFindElementAtDomOrderIndex(input.root, ${eventLocator.index}, "input")`);
	expect(resumeSource).toContain(`marklessFindElementAtDomOrderIndex(input.root, ${updateLocator.index}, "output")`);
	expect(resumeSource).toContain('marklessAssertScalarCell(cell, "state:tally"');
	expect(resumeSource).toContain('marklessScalarSpecializedTextValue');
	expect(resumeSource).toContain('"Total: " +');
	expect(resumeSource).not.toContain('@markless/web/event-only-lean/scalar-core');
	expect(resumeSource).not.toContain('payloadRuntimeDemandMap.actions.find');
	expect(allowed).toContain('web/fns/write-scalar');
	expect(allowed).toContain('web/fns/update-text');
	expect(allowed).not.toContain('web/event-only-lean/scalar-core');
	expect(allowed).not.toContain('web/fns/scalar-core-graph');
});

test('wrapped scalar action emits served locator indexes for host and text updates', async () => {
	const result = await transformTsrxModule({
		filename: '/workspace/app/Wrapped.tsrx',
		source: `
			import { state } from '@markless/core';
			export function Wrapped() @{
				let count = state(0);
				<div className="frame">
					<button onClick={() => count++}>{count}</button>
				</div>
			}
		`,
	});
	const payload = payloadView(result.virtualModules.find((module) => module.type === 'payload')?.source);
	const resumeSource = result.virtualModules.find((module) => module.type === 'resume')?.source ?? '';
	const event = payload.view.events[0];
	const update = payload.view.domUpdates[0];
	const eventLocator = servedLocator(payload.view.locators.find((locator: any) => locator.hostNodeId === event.hostNodeId));
	const updateLocator = servedLocator(payload.view.locators.find((locator: any) => locator.hostNodeId === update.hostNodeId));

	expect(eventLocator).toMatchObject({ tagName: 'button' });
	expect(updateLocator).toMatchObject({ tagName: 'button' });
	expect(resumeSource).toContain(
		`marklessScalarEventMatches(input, marklessFindElementAtDomOrderIndex(input.root, ${eventLocator.index}, "button"), "click", ${JSON.stringify(event.hostNodeId)})`,
	);
	expect(resumeSource).toContain(`marklessFindElementAtDomOrderIndex(input.root, ${updateLocator.index}, "button")`);
	expect(resumeSource).not.toContain('?? input.element ?? input.event.target');
});

test('scalar-looking actions with extra authored work stay on the full dispatch path', async () => {
	const result = await transformTsrxModule({
		filename: '/workspace/app/SideEffect.tsrx',
		source: `
			import { state } from '@markless/core';
			export function SideEffect() @{
				let count = state(0);
				<button onClick={() => { console.log('clicked'); count++; }}>{count}</button>
			}
		`,
	});
	const payload = payloadView(result.virtualModules.find((module) => module.type === 'payload')?.source);
	const resumeSource = result.virtualModules.find((module) => module.type === 'resume')?.source ?? '';
	const click = payload.view.events[0];
	const allowed = deriveAllowedModules(payload.view, payload.runtimeDemandMap, {
		hostNodeId: click.hostNodeId,
		eventName: click.eventName,
	});

	expect(payload.runtimeDemandMap.recordKinds).toEqual(
		['async-boundary', 'behavior', 'branch', 'dom-update', 'element-handle', 'event', 'keyed-repeat']
			.map((kind) => ({ kind, replaced: false })),
	);
	expect(payload.runtimeDemandMap.actions[0].plan).toBeUndefined();
	expect(resumeSource).not.toContain('marklessRunScalar');
	expect(resumeSource).not.toContain("import { marklessWriteScalar } from '@markless/web/fns/write-scalar';");
	expect(allowed).toContain('core/web/resume');
	expect(allowed).toContain('web/resume-runtime');
});

test('mixed scalar modules leave replacement phase flags open', async () => {
	const result = await transformTsrxModule({
		filename: '/workspace/app/Mixed.tsrx',
		source: `
			import { state } from '@markless/core';
			export function Mixed() @{
				let menu = state({ open: false });
				<button onClick={() => menu.open = true} className={menu.open ? 'open' : 'closed'}>Open</button>
			}
		`,
	});
	const payload = payloadView(result.virtualModules.find((module) => module.type === 'payload')?.source);

	expect(payload.runtimeDemandMap.recordKinds).toEqual(
		['async-boundary', 'behavior', 'branch', 'dom-update', 'element-handle', 'event', 'keyed-repeat']
			.map((kind) => ({ kind, replaced: false })),
	);
});

test('payload virtual module keeps runtime demand metadata out of the resumable view', async () => {
	const result = await transformTsrxModule({
		filename: '/workspace/app/ProjectedCard.tsrx',
		source: `
			import { state } from '@markless/core';
			import { Card } from './card.tsrx';
			export function App() @{
				let note = state('none');
				<main>
					<Card>
						<button onClick={() => note = 'clicked'}>Go</button>
						<output>{note}</output>
					</Card>
				</main>
			}
		`,
	});
	const payloadModule = result.virtualModules.find((module) => module.type === 'payload');
	const view = payloadViewOnly(payloadModule?.source);
	const demandMap = payloadRuntimeDemandMap(payloadModule?.source);
	const projectedClick = view.events.find((event: any) => event.eventName === 'click');

	expect(view.runtimeDemandMap).toBeUndefined();
	expect(projectedClick?.symbolIds).toEqual(['symbol:0']);
	expect(demandMap).toEqual(result.manifest.runtimeDemandMap);
});

test('mixed action kinds allow the structurally derived interpreter chain', async () => {
	const { payload } = await counterPayload();
	const mixedPayload = {
		...payload,
		runtimeDemandMap: {
			...payload.runtimeDemandMap,
			recordKinds: payload.runtimeDemandMap.recordKinds.map((kind: any) => ({
				...kind,
				replaced: false,
			})),
		},
	};
	const click = payload.view.events[0];
	const allowed = deriveAllowedModules(payload.view, mixedPayload.runtimeDemandMap, {
		hostNodeId: click.hostNodeId,
		eventName: click.eventName,
	});

	expect([...allowed].filter((id) => JUDGE_COUNTER_INTERPRETER_CHAIN_SET.has(id)).sort())
		.toEqual([...JUDGE_COUNTER_INTERPRETER_CHAIN].sort());
	expect(allowed).not.toContain('web/fns/csr');
	expect(allowed).not.toContain('web/fns/html');
	expect(allowed).not.toContain('web/fns/state');
	expect(allowed).not.toContain('web/inline/sync-policy-core');
	expect(allowed).not.toContain('web/payload');
});

test('keyed repeat row actions allow render-module catalog helper imports', async () => {
	const result = await transformTsrxModule({
		filename: '/workspace/app/Rows.tsrx',
		source: `
			import { state } from '@markless/core';
			export function Rows() @{
				let selected = state('none');
				let rows = state([]);
				<main><section>@for (const row of rows; key row.id) {<article><button onClick={() => selected = row.id}>Choose</button></article>}</section><output>{selected}</output></main>
			}
		`,
	});
	const payload = payloadView(result.virtualModules.find((module) => module.type === 'payload')?.source);
	const repeat = payload.view.keyedRepeats[0];
	const rowClick = repeat.rowEvents[0];
	const allowed = deriveAllowedModules(payload.view, payload.runtimeDemandMap, {
		hostNodeId: repeat.parentHostNodeId,
		eventName: rowClick.eventName,
		recordKind: 'keyed-repeat-row',
	});

	expect(payload.runtimeDemandMap.recordKinds).toContainEqual({ kind: 'keyed-repeat', replaced: true });
	expect(payload.runtimeDemandMap.recordKinds).toContainEqual({ kind: 'dom-update', replaced: true });
	expect(allowed).toContain('web/event-only-lean/row');
	expect(allowed).toContain('web/event-only-lean/lean-shared');
	expect(allowed).not.toContain('web/event-only-lean/scalar-core');
	expect(allowed).toContain('web/resume-keyed-repeats');
	expect([...allowed].filter((id) => JUDGE_COUNTER_INTERPRETER_CHAIN_SET.has(id))).toEqual([]);
	expect(payload.runtimeDemandMap.actions.find((action: any) => action.recordKind === 'keyed-repeat-row')?.plan)
		.toMatchObject({ version: 1, kind: 'row', cell: payload.view.domUpdates[0].graphNodeId, repeatId: repeat.id });
});

test('mixed scalar and row actions keep exact lean modules per action', async () => {
	const result = await transformTsrxModule({
		filename: '/workspace/app/MixedRows.tsrx',
		source: `
			import { state } from '@markless/core';
			export function MixedRows() @{
				let count = state(0);
				let selected = state('none');
				let rows = state([{ id: 'north' }]);
				<main>
					<button onClick={() => count++}>{count}</button>
					<section>@for (const row of rows; key row.id) {<article><button onClick={() => selected = row.id}>Choose</button></article>}</section>
					<output>{selected}</output>
				</main>
			}
		`,
	});
	const payload = payloadView(result.virtualModules.find((module) => module.type === 'payload')?.source);
	const counterClick = payload.view.events[0];
	const repeat = payload.view.keyedRepeats[0];
	const rowClick = repeat.rowEvents[0];
	const counterAllowed = deriveAllowedModules(payload.view, payload.runtimeDemandMap, {
		hostNodeId: counterClick.hostNodeId,
		eventName: counterClick.eventName,
	});
	const rowAllowed = deriveAllowedModules(payload.view, payload.runtimeDemandMap, {
		hostNodeId: repeat.parentHostNodeId,
		eventName: rowClick.eventName,
		recordKind: 'keyed-repeat-row',
	});

	expect(payload.runtimeDemandMap.recordKinds).toContainEqual({ kind: 'event', replaced: true });
	expect(payload.runtimeDemandMap.recordKinds).toContainEqual({ kind: 'keyed-repeat', replaced: true });
	expect(counterAllowed).not.toContain('web/event-only-lean/scalar-core');
	expect(counterAllowed).not.toContain('web/event-only-lean/lean-shared');
	expect(counterAllowed).not.toContain('web/fns/scalar-core-graph');
	expect(counterAllowed).not.toContain('web/event-only-lean/row');
	expect(rowAllowed).toContain('web/event-only-lean/row');
	expect(rowAllowed).not.toContain('web/event-only-lean/scalar-core');
});

test('keyed repeat row actions with non-text subscribers stay unreplaced', async () => {
	const result = await transformTsrxModule({
		filename: '/workspace/app/RowsInput.tsrx',
		source: `
			import { state } from '@markless/core';
			export function RowsInput() @{
				let selected = state('none');
				let rows = state([{ id: 'north' }]);
				<main><section>@for (const row of rows; key row.id) {<article><button onClick={() => selected = row.id}>Choose</button></article>}</section><input value={selected} /></main>
			}
		`,
	});
	const payload = payloadView(result.virtualModules.find((module) => module.type === 'payload')?.source);

	expect(payload.runtimeDemandMap.recordKinds).toContainEqual({ kind: 'keyed-repeat', replaced: false });
	expect(payload.runtimeDemandMap.recordKinds).toContainEqual({ kind: 'dom-update', replaced: false });
});

test('replaced action kinds tighten back to the exact demand set', async () => {
	const { payload } = await counterPayload();
	const click = payload.view.events[0];
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
	const allowed = deriveAllowedModules(payload.view, replacedPayload.runtimeDemandMap, {
		hostNodeId: click.hostNodeId,
		eventName: click.eventName,
	});

	expect(allowed).toContain('web/fns/write-scalar');
	expect(allowed).toContain('web/fns/update-text');
	expect(allowed).not.toContain('web/fns/scalar-core-graph');
	expect(allowed).not.toContain('web/event-only-lean/scalar-core');
	expect(allowed).not.toContain('web/event-only-lean/lean-shared');
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
	const click = payload.view.events[0];
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
	const allowed = deriveAllowedModules(payload.view, corruptedPayload.runtimeDemandMap, {
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

// T014 tier-collapse receipt: the event-only middle tier was deleted. Mixed
// unreplaced actions now fall through to the full dispatch core plus shared
// runtime error reporting.
const JUDGE_COUNTER_INTERPRETER_CHAIN = ['core/web/resume', 'web/resume', 'web/resume-runtime', 'web/resume-runtime-shared', 'web/resume-runtime-start', 'web/resume-events', 'web/resume-locators', 'web/payload-full', 'web/payload-resume', 'web/payload-graph-construct', 'web/resume-async-wiring'] as const; // runtime-error-reporting removed: shared dispatch infra post tier collapse, not interpreter machinery
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
	return {
		view: payloadViewOnly(source),
		runtimeDemandMap: payloadRuntimeDemandMap(source),
	};
}

function payloadViewOnly(source: string | undefined): any {
	const match = source?.match(/export const view = ([\s\S]*);\s*$/);
	if (!match) throw new Error('Expected payload virtual module to export view.');
	return JSON.parse(match[1]);
}

function payloadRuntimeDemandMap(source: string | undefined): any {
	const match = source?.match(/export const runtimeDemandMap = ([\s\S]*?);\nexport const view = /);
	if (!match) throw new Error('Expected payload virtual module to export runtimeDemandMap.');
	return JSON.parse(match[1]);
}

function servedLocator(locator: any): any {
	return { ...locator, index: locator.index + 1 };
}
