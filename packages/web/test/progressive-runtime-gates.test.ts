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
	vi.resetModules();
});

test('full resume row dispatch does not import unrelated declared capabilities', async () => {
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
	expect(branchImports).toBe(0);
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
