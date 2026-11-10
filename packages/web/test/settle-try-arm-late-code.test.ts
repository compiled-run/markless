import { expect, test } from 'vitest';
import { ASYNC_BOUNDARY_ARM } from '@markless/serializer';
import { settleAsyncBoundaryRange } from '../src/resume-async-wiring.ts';
import type { ArmCommitUpdate } from '../src/resume-commit-arm.ts';
import type { ResumeAsyncBoundaryRecord } from '../src/resume-types.ts';

// A boundary that reads an async value through a sync computed: the computed is its runner and has no status of its own.
function harness(label: unknown) {
	const statuses: Record<string, unknown> = { 'computed:invoices': 'fulfilled' };
	const boundary = {
		id: 'next',
		runnerGraphNodeId: 'computed:label',
		initiallyServedArm: ASYNC_BOUNDARY_ARM.pending,
		updateSymbolId: 'symbol:arm',
		asyncReads: [
			{ source: 'label', graphNodeId: 'computed:invoices', path: ['value', 'page'], runnerSymbolId: 'symbol:run' },
			{ source: 'label', graphNodeId: 'computed:label', path: [] },
		],
	} as unknown as ResumeAsyncBoundaryRecord;
	const graph = {
		read: (graphNodeId: string, path: ReadonlyArray<string>) =>
			graphNodeId === 'computed:label' ? label : path[0] === 'status' ? statuses[graphNodeId] : undefined,
	};
	const commits: ArmCommitUpdate[] = [];
	let whileArmCodeLoads = () => {};
	const settle = () =>
		settleAsyncBoundaryRange(
			{
				graph: graph as never,
				root: {} as never,
				loadSymbol: async () => {
					whileArmCodeLoads();
					return (async () => ({
						arm: ASYNC_BOUNDARY_ARM.try,
						html: '<button></button>',
						armRecords: { locators: [], events: [], behaviors: [], elementHandles: [] },
					})) as never;
				},
				renderBranchHtml: undefined,
				elementHandles: { get: () => undefined } as never,
				commitArm: async (_, update) => void commits.push(update),
			},
			boundary,
			{ status: 'fulfilled', version: 2 },
		);
	return {
		commits,
		settle,
		refetchWhileArmCodeLoads() {
			whileArmCodeLoads = () => (statuses['computed:invoices'] = 'pending');
		},
		land() {
			whileArmCodeLoads = () => {};
			statuses['computed:invoices'] = 'fulfilled';
		},
	};
}

test('an async value that goes pending while the @try arm code loads commits nothing until it lands', async () => {
	const { commits, settle, refetchWhileArmCodeLoads, land } = harness(false);
	refetchWhileArmCodeLoads();
	await settle();
	expect(commits).toEqual([]);
	land();
	await settle();
	expect(commits.map((update) => update.arm)).toEqual([ASYNC_BOUNDARY_ARM.try]);
});

test('a settled boundary commits its @try arm even when the sync value it reads is undefined', async () => {
	const { commits, settle } = harness(undefined);
	await settle();
	expect(commits.map((update) => update.arm)).toEqual([ASYNC_BOUNDARY_ARM.try]);
});

test('a settle held behind a pending arm commit yields to an async value that went pending meanwhile', async () => {
	const boundary = {
		id: 'totals',
		runnerGraphNodeId: null,
		initiallyServedArm: ASYNC_BOUNDARY_ARM.pending,
		updateSymbolId: 'symbol:arm',
		asyncReads: [
			{ source: 'sum', graphNodeId: 'computed:rates', path: [], runnerSymbolId: 'symbol:rates' },
			{ source: 'sum', graphNodeId: 'computed:orders', path: [], runnerSymbolId: 'symbol:orders' },
		],
	} as unknown as ResumeAsyncBoundaryRecord;
	const statuses: Record<string, string> = { 'computed:rates': 'fulfilled', 'computed:orders': 'pending' };
	const commits: ArmCommitUpdate[] = [];
	const settle = () =>
		settleAsyncBoundaryRange(
			{
				graph: { read: (graphNodeId: string) => statuses[graphNodeId] } as never,
				root: {} as never,
				loadSymbol: async () =>
					(async () => ({
						arm: ASYNC_BOUNDARY_ARM.try,
						html: '<b></b>',
						armRecords: { locators: [], events: [], behaviors: [], elementHandles: [] },
					})) as never,
				renderBranchHtml: undefined,
				elementHandles: { get: () => undefined } as never,
				commitArm: async (_, update) => void commits.push(update),
				settleTracker: { waitOutCommitHold: async () => true, markSettled() {} } as never,
			},
			boundary,
			{ status: 'fulfilled', version: 1 },
		);
	await settle();
	expect(commits).toEqual([]);
	statuses['computed:orders'] = 'fulfilled';
	await settle();
	expect(commits.map((update) => update.arm)).toEqual([ASYNC_BOUNDARY_ARM.try]);
});
