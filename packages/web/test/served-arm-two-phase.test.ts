import { expect, test } from 'vitest';
import { registerArmRecordSet, type ArmRegistrationDeps } from '../src/resume-commit-arm.ts';
import type { ResumeArmRecordSet, ResumeDomElement } from '../src/index.ts';

// An arm settled in the browser registers the arms painted inside it, at any depth, in two phases: events and
// handles at once, everything else once this arm's state and computeds exist.

type FakeNode = { nodeType: number; data?: string; tagName?: string; childNodes: FakeNode[] };
const comment = (data: string): FakeNode => ({ nodeType: 8, data, childNodes: [] });
const element = (tagName: string, children: FakeNode[] = []): FakeNode => ({
	nodeType: 1,
	tagName: tagName.toUpperCase(),
	childNodes: children,
});
const records = (overrides: Partial<ResumeArmRecordSet>): ResumeArmRecordSet => ({
	locators: [],
	events: [],
	behaviors: [],
	elementHandles: [],
	...overrides,
});
const repeat = (id: string, parentHostNodeId: string) =>
	({ id, parentHostNodeId, collectionPath: [], keyPath: [], itemName: 'row', rowElementCount: 1, rowEvents: [] }) as never;

function painted() {
	const outerStart = comment('async-boundary:b0:start'),
		outerEnd = comment('/async-boundary:b0'),
		firstStart = comment('markless:arm-branch:first'),
		firstEnd = comment('/markless:arm-branch:first'),
		secondStart = comment('markless:arm-branch:second'),
		secondEnd = comment('/markless:arm-branch:second');
	const root = element('main', [
		outerStart,
		element('section', [firstStart, element('ul'), element('p'), secondStart, element('ol'), secondEnd, firstEnd]),
		outerEnd,
	]);
	const second = records({
		locators: [{ hostNodeId: 'h-deep', index: 0, tagName: 'ol' }] as never,
		keyedRepeats: [repeat('deep-rows', 'h-deep')],
	});
	const first = records({
		locators: [
			{ hostNodeId: 'h-list', index: 0, tagName: 'ul' },
			{ hostNodeId: 'h-text', index: 1, tagName: 'p' },
		] as never,
		keyedRepeats: [repeat('rows', 'h-list')],
		domUpdates: [
			{ hostNodeId: 'h-text', graphNodeId: 'computed:count', path: [], target: { kind: 'text' }, symbolId: 'sym:text' },
		] as never,
		branches: [{ id: 'second', startAnchor: secondStart, endAnchor: secondEnd, servedArmRecords: second }] as never,
	});
	const outer = records({
		locators: [{ hostNodeId: 'h-section', index: 0, tagName: 'section' }] as never,
		branches: [{ id: 'first', startAnchor: firstStart, endAnchor: firstEnd, servedArmRecords: first }] as never,
	});
	return { root, outer, boundary: { id: 'b0', startAnchor: outerStart, endAnchor: outerEnd } as never };
}

function registration(root: FakeNode, log: string[], computedRegistered: Promise<void>): ArmRegistrationDeps {
	return {
		root: root as unknown as ResumeDomElement,
		elementsByHostId: new Map(),
		disposedHosts: new Set(),
		disposeHost: () => {},
		addEventRecord: () => {},
		registerElementHandle: () => {},
		graph: {
			write: () => {},
			read: () => undefined,
			subscribe: (subscription: { readonly graphNodeId: string }) => {
				log.push(`text over ${subscription.graphNodeId}`);
				return () => {};
			},
		} as never,
		loadSymbol: () => () => {},
		storeHostSubscription: () => {},
		registerComputedRefreshes: () => {
			log.push('computeds');
			return computedRegistered;
		},
		registerKeyedRepeats: async (repeats, _moved, computed) => {
			log.push(`lists ${repeats.map((each) => each.id).join(',')} with ${computed?.length ?? 0} computeds`);
		},
		registerArmBranches: async (boundaryId, branches) => {
			log.push(`branches of ${boundaryId}: ${branches.map((branch) => branch.id).join(',')}`);
		},
	};
}

const computed = [{ graphNodeId: 'computed:count', async: false, deriveSymbolId: 'sym:count' }] as never;

test('nothing an inner arm wires but its events and handles runs before the outer arm\'s computeds exist', async () => {
	const { root, outer, boundary } = painted();
	const log: string[] = [];
	let release!: () => void;
	const held = new Promise<void>((resolve) => (release = resolve));
	const done = registerArmRecordSet(registration(root, log, held), () => {}, boundary, { armRecords: outer, computed });
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(log).toEqual(['computeds']);
	release();
	await done;
	expect(log).toEqual([
		'computeds',
		'lists rows,deep-rows with 1 computeds',
		'branches of first: second',
		'text over computed:count',
		'branches of b0: first',
	]);
});

test('an inner arm whose hosts are not on the page fails the registration instead of dropping its lists', async () => {
	const { root, outer, boundary } = painted();
	const first = (outer.branches as never as Array<{ servedArmRecords: ResumeArmRecordSet }>)[0]!.servedArmRecords;
	(first.locators as Array<{ tagName: string }>)[0]!.tagName = 'table';
	await expect(
		registerArmRecordSet(registration(root, [], Promise.resolve()), () => {}, boundary, { armRecords: outer, computed }),
	).rejects.toThrow(/table/);
});
