import { expect, test } from 'vitest';
import { createArmCommitter } from '../src/resume-commit-arm.ts';
import type {
	ResumeArmRecordSet,
	ResumeAsyncBoundaryRecord,
	ResumeDomElement,
	ResumeDomNode,
} from '../src/index.ts';

// commitArm mechanics that a synthetic DOM can prove without a browser:
// anchor-range replacement, dispose-then-register ordering, fail-loud anchor
// census, and the focus/scroll capture-restore contract.

type FakeNode = {
	nodeType: number;
	data?: string;
	tagName?: string;
	childNodes: FakeNode[];
	parentNode?: FakeParent | null;
	parentElement?: FakeNode | null;
	attributes?: Record<string, string>;
	getAttribute?: (name: string) => string | null;
	focus?: () => void;
	focused?: boolean;
	selectionStart?: number | null;
	selectionEnd?: number | null;
	selections?: Array<[number, number]>;
	setSelectionRange?: (start: number, end: number) => void;
};

type FakeParent = FakeNode & {
	insertBefore: (node: FakeNode, before: FakeNode | null) => FakeNode;
	removeChild: (node: FakeNode) => FakeNode;
};

function comment(data: string): FakeNode {
	return { nodeType: 8, data, childNodes: [] };
}

function element(tagName: string, children: FakeNode[] = []): FakeParent {
	const node: FakeParent = {
		nodeType: 1,
		tagName: tagName.toUpperCase(),
		childNodes: children,
		attributes: {},
		getAttribute(name) {
			return node.attributes?.[name] ?? null;
		},
		focus() {
			node.focused = true;
		},
		insertBefore(child, before) {
			adopt(node, child);
			const index = before ? node.childNodes.indexOf(before) : -1;
			if (index === -1) node.childNodes.push(child);
			else node.childNodes.splice(index, 0, child);
			return child;
		},
		removeChild(child) {
			const index = node.childNodes.indexOf(child);
			if (index !== -1) node.childNodes.splice(index, 1);
			child.parentNode = null;
			child.parentElement = null;
			return child;
		},
	};
	for (const child of children) adopt(node, child);
	return node;
}

function adopt(parent: FakeParent, child: FakeNode): void {
	child.parentNode = parent;
	child.parentElement = parent.nodeType === 1 ? parent : null;
}

function asElement(node: FakeNode): ResumeDomElement {
	return node as unknown as ResumeDomElement;
}

function boundaryFor(start: FakeNode, end: FakeNode): ResumeAsyncBoundaryRecord {
	return {
		id: 'b0',
		updateSymbolId: 'sym:update',
		startAnchor: start as never,
		endAnchor: end as never,
		asyncReads: [],
	};
}

function emptyArmRecords(overrides: Partial<ResumeArmRecordSet> = {}): ResumeArmRecordSet {
	return { locators: [], events: [], behaviors: [], elementHandles: [], ...overrides };
}

function fixture() {
	const start = comment('async-boundary:b0:start');
	const end = comment('async-boundary:b0:end');
	const oldButton = element('button');
	const oldSection = element('section', [oldButton]);
	const outside = element('output');
	const root = element('main', [outside, start, oldSection, end]);
	return { root, start, end, oldSection, oldButton, outside };
}

test('commitArm replaces exactly the anchor range and disposes before re-registering', async () => {
	const { root, start, end, oldButton, outside } = fixture();
	const order: string[] = [];
	const newButton = element('button');
	const newSection = element('section', [newButton]);
	const elementsByHostId = new Map<string, ResumeDomElement>([
		['h-old', asElement(oldButton)],
		['h-out', asElement(outside)],
	]);
	const disposedHosts = new Set<string>(['h-new']);

	const commitArm = createArmCommitter({
		root: asElement(root),
		renderHtml: () => [asElement(newSection) as ResumeDomNode],
		elementsByHostId,
		disposedHosts,
		disposeHost(hostNodeId) {
			order.push(`dispose:${hostNodeId}`);
			elementsByHostId.delete(hostNodeId);
		},
		addEventRecord(_, record) {
			order.push(`event:${record.hostNodeId}`);
		},
		registerElementHandle(hostNodeId) {
			order.push(`handle:${hostNodeId}`);
		},
	});

	await commitArm(boundaryFor(start, end), {
		html: '<section><button></button></section>',
		armRecords: emptyArmRecords({
			locators: [
				{ hostNodeId: 'h-new', strategy: 'arm-relative', index: 1, tagName: 'button' },
			],
			events: [{ hostNodeId: 'h-new', eventName: 'click', symbolIds: ['sym:click'] }],
			elementHandles: [{ hostNodeId: 'h-new', handleId: 'handle-1', name: 'field' }],
		}),
	});

	// The range between the anchors was replaced; siblings and anchors stayed.
	expect(root.childNodes).toEqual([outside, start, newSection, end]);
	// Outgoing hosts inside the range disposed BEFORE the fresh registration.
	expect(order).toEqual(['dispose:h-old', 'event:h-new', 'handle:h-new']);
	expect(elementsByHostId.get('h-new')).toBe(asElement(newButton));
	expect(elementsByHostId.has('h-old')).toBe(false);
	// Hosts outside the range are untouched.
	expect(elementsByHostId.get('h-out')).toBe(asElement(outside));
	// A re-registered host is live again for behavior/event gating.
	expect(disposedHosts.has('h-new')).toBe(false);
});

test('commitArm has no post-swap await before fresh event records are dispatchable', async () => {
	const { root, start, end, outside } = fixture();
	const newButton = element('button');
	const newSection = element('section', [newButton]);
	const eventRecords = new WeakMap<ResumeDomElement, Map<string, string[]>>();
	let loadedSymbols = 0;

	const commitArm = createArmCommitter({
		root: asElement(root),
		renderHtml: () => [asElement(newSection) as ResumeDomNode],
		elementsByHostId: new Map(),
		disposedHosts: new Set(),
		disposeHost: () => {},
		addEventRecord(element, record) {
			const byName = eventRecords.get(element) ?? new Map<string, string[]>();
			byName.set(record.eventName, [...record.symbolIds]);
			eventRecords.set(element, byName);
		},
		registerElementHandle: () => {},
		reportEventBindError() {
			expect(root.childNodes).toEqual([outside, start, newSection, end]);
			const symbols = eventRecords.get(asElement(newButton))?.get('click');
			if (!symbols) throw new Error('fresh button was not dispatchable after arm swap');
			loadedSymbols += symbols.length;
		},
	});

	await commitArm(boundaryFor(start, end), {
		html: '<section><button></button></section>',
		armRecords: emptyArmRecords({
			locators: [
				{ hostNodeId: 'h-new', strategy: 'arm-relative', index: 1, tagName: 'button' },
			],
			events: [
				{ hostNodeId: 'h-missing', eventName: 'click', symbolIds: ['sym:missing'] },
				{ hostNodeId: 'h-new', eventName: 'click', symbolIds: ['sym:click'] },
			],
		}),
	});

	expect(loadedSymbols).toBe(1);
});

test('commitArm fails loud when the anchor pair is not intact in the live DOM', async () => {
	const { root, start, oldSection } = fixture();
	// The end anchor lives in a DIFFERENT parent: the census is corrupt.
	const strandedEnd = comment('async-boundary:b0:end');
	element('div', [strandedEnd]);

	const commitArm = createArmCommitter({
		root: asElement(root),
		renderHtml: () => [],
		elementsByHostId: new Map(),
		disposedHosts: new Set(),
		disposeHost: () => {},
		addEventRecord: () => {},
		registerElementHandle: () => {},
	});

	await expect(
		commitArm(boundaryFor(start, strandedEnd), { html: '', armRecords: emptyArmRecords() }),
	).rejects.toMatchObject({
		name: 'RuntimeResumeError',
		code: 'MARKLESS_ARM_COMMIT_ANCHORS_MISSING',
	});
	// Fail-loud means fail-clean: nothing was removed from the range.
	expect(root.childNodes.includes(oldSection)).toBe(true);
});

test('commitArm fails loud without an HTML renderer for the settled content', async () => {
	const { root, start, end } = fixture();
	const commitArm = createArmCommitter({
		root: asElement(root),
		elementsByHostId: new Map(),
		disposedHosts: new Set(),
		disposeHost: () => {},
		addEventRecord: () => {},
		registerElementHandle: () => {},
	});

	await expect(
		commitArm(boundaryFor(start, end), { html: '<p></p>', armRecords: emptyArmRecords() }),
	).rejects.toMatchObject({
		name: 'RuntimeResumeError',
		code: 'MARKLESS_ARM_COMMIT_RENDERER_MISSING',
	});
});

test('commitArm reports event records whose host is absent from the committed arm', async () => {
	const { root, start, end } = fixture();
	const reported: unknown[] = [];
	const commitArm = createArmCommitter({
		root: asElement(root),
		renderHtml: () => [],
		elementsByHostId: new Map(),
		disposedHosts: new Set(),
		disposeHost: () => {},
		addEventRecord: () => {},
		registerElementHandle: () => {},
		reportEventBindError: (record) => void reported.push(record),
	});

	await commitArm(boundaryFor(start, end), {
		html: '',
		armRecords: emptyArmRecords({
			events: [
				{ hostNodeId: 'h-missing', eventName: 'click', symbolIds: ['symbol:openPanel'] },
			],
		}),
	});

	expect(reported).toEqual([
		{ hostNodeId: 'h-missing', eventName: 'click', symbolIds: ['symbol:openPanel'] },
	]);
});

test('commitArm restores focus and selection onto the surviving hostNodeId', async () => {
	const { root, start, end, oldSection } = fixture();
	const oldInput = element('input');
	oldInput.selectionStart = 2;
	oldInput.selectionEnd = 4;
	oldSection.insertBefore(oldInput, null);

	const newInput = element('input');
	const newInputSelections: Array<[number, number]> = [];
	newInput.setSelectionRange = (from, to) => {
		newInputSelections.push([from, to]);
	};
	const newSection = element('section', [newInput]);

	const commitArm = createArmCommitter({
		root: asElement(root),
		renderHtml: () => [asElement(newSection) as ResumeDomNode],
		elementsByHostId: new Map([['h-field', asElement(oldInput)]]),
		disposedHosts: new Set(),
		disposeHost: () => {},
		addEventRecord: () => {},
		registerElementHandle: () => {},
		documentHost: { activeElement: oldInput },
	});

	await commitArm(boundaryFor(start, end), {
		html: '<section><input></section>',
		armRecords: emptyArmRecords({
			locators: [
				{ hostNodeId: 'h-field', strategy: 'arm-relative', index: 1, tagName: 'input' },
			],
		}),
	});

	expect(newInput.focused).toBe(true);
	expect(newInputSelections).toEqual([[2, 4]]);
});

test('commitArm restores the document scroll position when the commit moved it', async () => {
	const { root, start, end } = fixture();
	const scrollCalls: Array<[number, number]> = [];
	const view = {
		scrollX: 0,
		scrollY: 120,
		scrollTo(x: number, y: number) {
			scrollCalls.push([x, y]);
		},
	};
	// Removing the outgoing range collapses the page height: the browser
	// clamps the scroll position, which the fake models on removeChild.
	const originalRemoveChild = root.removeChild.bind(root);
	root.removeChild = (child) => {
		view.scrollY = 0;
		return originalRemoveChild(child);
	};

	const commitArm = createArmCommitter({
		root: asElement(root),
		renderHtml: () => [asElement(element('p')) as ResumeDomNode],
		elementsByHostId: new Map(),
		disposedHosts: new Set(),
		disposeHost: () => {},
		addEventRecord: () => {},
		registerElementHandle: () => {},
		documentHost: { activeElement: null, defaultView: view },
	});

	await commitArm(boundaryFor(start, end), {
		html: '<p></p>',
		armRecords: emptyArmRecords(),
	});

	expect(scrollCalls).toEqual([[0, 120]]);
});
