import { createRuntimeGraph } from '@markless/runtime';
import { afterEach, expect, test, vi } from 'vitest';
import type { ResumeViewRecord } from '../src/resume-types.ts';

type FakeElement = {
	readonly nodeType: 1;
	readonly tagName: string;
	readonly childNodes: FakeNode[];
	parentElement?: FakeElement | null;
	readonly listeners: Array<{
		readonly type: string;
		readonly listener: (event: FakeEvent) => Promise<void>;
	}>;
	dispatchEvent?: () => boolean;
	addEventListener(type: string, listener: (event: FakeEvent) => Promise<void>): void;
	removeEventListener(type: string, listener: (event: FakeEvent) => Promise<void>): void;
};
type FakeComment = { readonly nodeType: 8; readonly data: string };
type FakeNode = FakeElement | FakeComment;
type FakeEvent = { readonly type: string; readonly target: FakeElement };

afterEach(() => {
	vi.doUnmock('../src/resume-async-boundaries.ts');
	vi.doUnmock('../src/resume-behaviors.ts');
	vi.doUnmock('../src/resume-branches.ts');
	vi.doUnmock('../src/resume-handoff.ts');
	vi.resetModules();
});

test('full resume row dispatch wires declared branches but not unrelated async or behavior capabilities', async () => {
	let asyncBoundaryImports = 0, behaviorImports = 0, branchImports = 0, handoffImports = 0;
	vi.doMock('../src/resume-async-boundaries.ts', () => {
		asyncBoundaryImports++;
		return { wireAsyncBoundaries: vi.fn(() => new Map()) };
	});
	vi.doMock('../src/resume-behaviors.ts', () => {
		behaviorImports++;
		return {
			createBehaviorRuntime: vi.fn(() => ({
				addBehaviorRecords: vi.fn(),
				activateBehaviors: vi.fn(),
				activateBehaviorsFromTrigger: vi.fn(),
				behaviorHostIdsForAncestors: vi.fn(() => []),
				disconnect: vi.fn(),
				disposeBehaviorHost: vi.fn(),
				installRemovalObserver: vi.fn(),
				installVisibilityObserver: vi.fn(),
			})),
		};
	});
	vi.doMock('../src/resume-branches.ts', () => {
		branchImports++;
		return {
			wireBranches: vi.fn(() => ({
				branchesById: new Map(),
				startupArmBehaviorHostIds: [],
				disposeRemovedRangeHosts: vi.fn(),
				materializeFlippedBranchArms: vi.fn(),
			})),
		};
	});
	vi.doMock('../src/resume-handoff.ts', () => {
		handoffImports++;
		return {
			defaultSharedPatchDispatcher: vi.fn(),
			isResumeSharedPatchEvent: vi.fn(() => false),
		};
	});

	const { createResumeRuntime } = await import('../src/resume.ts');
	const button = element('BUTTON');
	const tbody = element('TBODY', [element('TR', [button])]);
	const root = element('SECTION', [
		tbody,
		element('DIV'),
		comment('async start'),
		element('SMALL'),
		comment('async end'),
		comment('branch start'),
		element('P'),
		comment('branch end'),
	]);
	root.dispatchEvent = () => true;
	const graph = createRuntimeGraph({
		cells: [
			{ graphNodeId: 'state:rows', value: [{ id: 'north' }] },
			{ graphNodeId: 'state:flag', value: true },
		],
	});
	const loadedSymbols: string[] = [];
	const runtime = createResumeRuntime({
		root,
		graph,
		view: progressiveMixedView(),
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return () => undefined;
		},
	});

	await runtime.start();
	await runtime.dispatch({ type: 'click', target: button });

	expect(loadedSymbols).toEqual(['symbol:row']);
	expect(asyncBoundaryImports).toBe(0);
	expect(behaviorImports).toBe(0);
	// PM ruling, spec 06 gate 2: declared branch records wire eagerly; async and
	// behavior capability groups remain demand-gated.
	expect(branchImports).toBe(1);
	expect(handoffImports).toBe(0);
});

test('branch records wire eagerly once and source writes still apply the current arm', async () => {
	let branchImports = 0;
	vi.doMock('../src/resume-branches.ts', async () => {
		branchImports++;
		return await vi.importActual('../src/resume-branches.ts');
	});

	const { createResumeRuntime } = await import('../src/resume.ts');
	const start = comment('branch start');
	const shown = element('P');
	const end = comment('branch end');
	const root = element('SECTION', [start, shown, end]);
	const hidden = element('P');
	const graph = createRuntimeGraph({ cells: [{ graphNodeId: 'state:flag', value: true }] });
	const loadedSymbols: string[] = [];
	const applied: unknown[] = [];
	const runtime = createResumeRuntime({
		root,
		graph,
		view: branchCapabilityView(),
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return ({ graph: runtimeGraph }) => ({
				arm: runtimeGraph.read('state:flag') ? 0 : 1,
				html: '<p>Hidden</p>',
			});
		},
		renderBranchHtml: () => [hidden],
		applyDomJournal(entries) {
			applied.push(...entries);
		},
	});

	await runtime.start();
	// PM ruling, spec 06 gate 2: branches wire eagerly when declared.
	expect(branchImports).toBe(1);

	graph.write({ graphNodeId: 'state:flag', value: false });
	await graph.flush();

	expect(branchImports).toBe(1);
	expect(loadedSymbols).toEqual(['symbol:branch']);
	expect(applied).toEqual([
		{ type: 'removeRange', locator: 'branch:site:0' },
		{ type: 'insertRange', locator: 'branch:site:0:start', fragment: [hidden] },
	]);
});

test('row collection writes do not import unrelated async or behavior capabilities', async () => {
	let asyncBoundaryImports = 0, behaviorImports = 0, branchImports = 0;
	vi.doMock('../src/resume-async-boundaries.ts', () => {
		asyncBoundaryImports++;
		return { wireAsyncBoundaries: vi.fn(() => new Map()) };
	});
	vi.doMock('../src/resume-behaviors.ts', () => {
		behaviorImports++;
		return {
			createBehaviorRuntime: vi.fn(() => ({
				addBehaviorRecords: vi.fn(),
				activateBehaviors: vi.fn(),
				activateBehaviorsFromTrigger: vi.fn(),
				behaviorHostIdsForAncestors: vi.fn(() => []),
				disconnect: vi.fn(),
				disposeBehaviorHost: vi.fn(),
				installRemovalObserver: vi.fn(),
				installVisibilityObserver: vi.fn(),
			})),
		};
	});
	vi.doMock('../src/resume-branches.ts', async () => {
		branchImports++;
		return await vi.importActual('../src/resume-branches.ts');
	});

	const { createResumeRuntime } = await import('../src/resume.ts');
	const root = element('SECTION', [
		element('TBODY', [element('TR')]),
		comment('branch start'),
		element('P'),
		comment('branch end'),
	]);
	const graph = createRuntimeGraph({
		cells: [
			{ graphNodeId: 'state:rows', value: [{ id: 'north' }] },
			{ graphNodeId: 'state:flag', value: true },
		],
	});
	const runtime = createResumeRuntime({
		root,
		graph,
		view: {
			...branchCapabilityView(),
			locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 1, tagName: 'tbody' }],
			keyedRepeats: [{
				id: 'repeat:0',
				parentHostNodeId: 'h0',
				collectionGraphNodeId: 'state:rows',
				collectionPath: [],
				keyPath: ['id'],
				itemName: 'row',
				rowElementCount: 1,
				rowEvents: [],
			}],
		},
		loadSymbol: () => () => undefined,
	});

	await runtime.start();
	graph.write({ graphNodeId: 'state:rows', value: [{ id: 'south' }] });
	await graph.flush();

	// PM ruling, spec 06 gate 2: declared branch records wire eagerly; the row
	// write still must not demand async or behavior capabilities.
	expect(branchImports).toBe(1);
	expect(asyncBoundaryImports).toBe(0);
	expect(behaviorImports).toBe(0);
});

function progressiveMixedView(): ResumeViewRecord {
	return {
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 1, tagName: 'tbody' },
			{ hostNodeId: 'h1', strategy: 'dom-order', index: 4, tagName: 'div' },
		],
		events: [],
		domUpdates: [],
		behaviors: [{ hostNodeId: 'h1', symbolId: 'symbol:behavior', inputSources: [] }],
		elementHandles: [],
		asyncBoundaries: [{
			id: 'async:0',
			updateSymbolId: 'symbol:async-update',
			startAnchor: { strategy: 'dom-order-comment', index: 0 },
			endAnchor: { strategy: 'dom-order-comment', index: 1 },
			asyncReads: [{ source: 'flag', graphNodeId: 'state:flag', path: [], runnerSymbolId: 'symbol:async-run' }],
		}],
		branches: [{
			id: 'branch:0',
			symbolId: 'symbol:branch',
			startAnchor: { strategy: 'dom-order-comment', index: 2 },
			endAnchor: { strategy: 'dom-order-comment', index: 3 },
			testReads: [{ graphNodeId: 'state:flag', path: [] }],
			armRecords: [
				{ events: [], domUpdates: [], behaviors: [], elementHandles: [] },
				{ events: [], domUpdates: [], behaviors: [], elementHandles: [] },
			],
		}],
		keyedRepeats: [{
			id: 'repeat:0',
			parentHostNodeId: 'h0',
			collectionGraphNodeId: 'state:rows',
			collectionPath: [],
			keyPath: ['id'],
			itemName: 'row',
			rowElementCount: 2,
			rowEvents: [{ hostPath: [0], eventName: 'click', symbolIds: ['symbol:row'] }],
		}],
	};
}

function branchCapabilityView(): ResumeViewRecord {
	return {
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
		branches: [{
			id: 'site:0',
			symbolId: 'symbol:branch',
			startAnchor: { strategy: 'dom-order-comment', index: 0 },
			endAnchor: { strategy: 'dom-order-comment', index: 1 },
			testReads: [{ graphNodeId: 'state:flag', path: [] }],
			armRecords: [
				{ events: [{ hostPath: [0], eventName: 'click', symbolIds: ['symbol:arm'] }], domUpdates: [], behaviors: [], elementHandles: [] },
				{ events: [], domUpdates: [], behaviors: [], elementHandles: [] },
			],
		}],
		keyedRepeats: [],
	};
}

function element(tagName: string, childNodes: FakeNode[] = []): FakeElement {
	const node: FakeElement = {
		nodeType: 1,
		tagName,
		childNodes,
		listeners: [],
		addEventListener(type, listener) {
			this.listeners.push({ type, listener });
		},
		removeEventListener(type, listener) {
			const index = this.listeners.findIndex(
				(entry) => entry.type === type && entry.listener === listener,
			);
			if (index >= 0) this.listeners.splice(index, 1);
		},
	};
	for (const child of childNodes) {
		if (child.nodeType === 1) child.parentElement = node;
	}
	return node;
}

function comment(data: string): FakeComment {
	return { nodeType: 8, data };
}
