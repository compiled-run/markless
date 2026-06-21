import type {
	BranchAnchor,
	EmptyFallback,
	ElementHandleBinding,
	HostNode,
	KeyedLoop,
	TextBinding,
	TsrxSemanticGraph,
} from './semantic-graph.ts';

export type LocatorOwnerKind = 'event' | 'behavior' | 'element-handle' | 'text-binding';

export type ElementLocatorRecord = {
	readonly kind: 'element';
	readonly hostNodeId: string;
	readonly tagName: string;
	readonly owns: ReadonlyArray<LocatorOwnerKind>;
};

export type CommentLocatorRecord = {
	readonly kind: 'comment';
	readonly anchorKind: 'branch' | 'keyed-list' | 'empty-fallback';
	readonly ownerId: string;
	readonly firstHostNodeId: string | null;
};

export type SkipLocatorRecord = {
	readonly kind: 'skip';
	readonly count: number;
};

export type PayloadLocatorStreamRecord =
	| ElementLocatorRecord
	| CommentLocatorRecord
	| SkipLocatorRecord;

export type LocatorStrategy = {
	readonly mode: 'dom-order-tree-walker';
	readonly requiresPerNodeAttributes: false;
	readonly usesVdom: false;
};

export type TextBindingLocatorRecord = TextBinding & {
	readonly locator: ElementLocatorRecord;
};

export type ElementHandleLocatorRecord = ElementHandleBinding & {
	readonly locator: ElementLocatorRecord;
};

export type BehaviorHostLocatorRecord = {
	readonly hostNodeId: string;
	readonly expression: string;
	readonly locator: ElementLocatorRecord;
};

export type BranchAnchorLocatorRecord = BranchAnchor & {
	readonly locator: CommentLocatorRecord;
};

export type KeyedListLocatorRecord = KeyedLoop & {
	readonly locator: CommentLocatorRecord;
};

export type EmptyFallbackLocatorRecord = EmptyFallback & {
	readonly locator: CommentLocatorRecord;
};

export type PayloadLocatorPlanningArtifact = {
	readonly phase: 'payload-locator-planning';
	readonly passId: 'payload-locator-planning';
	readonly filename: string;
	readonly locatorStrategy: LocatorStrategy;
	readonly locatorStream: ReadonlyArray<PayloadLocatorStreamRecord>;
	readonly dynamicHostNodeIds: ReadonlyArray<string>;
	readonly staticHostNodeIds: ReadonlyArray<string>;
	readonly textBindingRecords: ReadonlyArray<TextBindingLocatorRecord>;
	readonly elementHandleRecords: ReadonlyArray<ElementHandleLocatorRecord>;
	readonly behaviorHostRecords: ReadonlyArray<BehaviorHostLocatorRecord>;
	readonly branchAnchorRecords: ReadonlyArray<BranchAnchorLocatorRecord>;
	readonly keyedListRecords: ReadonlyArray<KeyedListLocatorRecord>;
	readonly emptyFallbackRecords: ReadonlyArray<EmptyFallbackLocatorRecord>;
	readonly diagnostics: ReadonlyArray<never>;
};

type StreamEntry = {
	readonly order: number;
	readonly priority: number;
	readonly record: ElementLocatorRecord | CommentLocatorRecord;
};

const ownerOrder: LocatorOwnerKind[] = ['event', 'behavior', 'element-handle', 'text-binding'];

export function planPayloadLocators(graph: TsrxSemanticGraph): PayloadLocatorPlanningArtifact {
	const hostIndex = new Map(graph.hostNodes.map((host, index) => [host.id, index]));
	const ownersByHostId = new Map<string, Set<LocatorOwnerKind>>();

	for (const eventProp of graph.eventProps) {
		addOwner(ownersByHostId, eventProp.hostNodeId, 'event');
	}

	for (const behaviorProp of graph.behaviorProps) {
		addOwner(ownersByHostId, behaviorProp.hostNodeId, 'behavior');
	}

	for (const binding of graph.elementHandleBindings) {
		addOwner(ownersByHostId, binding.hostNodeId, 'element-handle');
	}

	for (const binding of graph.textBindings) {
		addOwner(ownersByHostId, binding.hostNodeId, 'text-binding');
	}

	const elementRecords = graph.hostNodes
		.filter((host) => ownersByHostId.has(host.id))
		.map((host) => elementRecordFor(host, ownersByHostId));
	const elementRecordByHostId = new Map(
		elementRecords.map((record) => [record.hostNodeId, record]),
	);
	const dynamicHostNodeIds = elementRecords.map((record) => record.hostNodeId);
	const staticHostNodeIds = graph.hostNodes
		.filter((host) => !ownersByHostId.has(host.id))
		.map((host) => host.id);

	const branchAnchorRecords = graph.branchAnchors.map((anchor) => ({
		...anchor,
		locator: commentLocatorFor('branch', anchor.id, anchor.firstHostNodeId),
	}));
	const keyedListRecords = graph.keyedLoops.map((loop) => ({
		...loop,
		locator: commentLocatorFor('keyed-list', loop.id, loop.firstHostNodeId),
	}));
	const emptyFallbackRecords = graph.emptyFallbacks.map((fallback) => ({
		...fallback,
		locator: commentLocatorFor('empty-fallback', fallback.id, fallback.firstHostNodeId),
	}));

	return {
		phase: 'payload-locator-planning',
		passId: 'payload-locator-planning',
		filename: graph.filename,
		locatorStrategy: {
			mode: 'dom-order-tree-walker',
			requiresPerNodeAttributes: false,
			usesVdom: false,
		},
		locatorStream: buildLocatorStream({
			elementRecords,
			commentRecords: [
				...branchAnchorRecords.map((record) => record.locator),
				...keyedListRecords.map((record) => record.locator),
				...emptyFallbackRecords.map((record) => record.locator),
			],
			hostIndex,
		}),
		dynamicHostNodeIds,
		staticHostNodeIds,
		textBindingRecords: graph.textBindings.map((binding) => ({
			...binding,
			locator: requiredElementLocator(elementRecordByHostId, binding.hostNodeId),
		})),
		elementHandleRecords: graph.elementHandleBindings.map((binding) => ({
			...binding,
			locator: requiredElementLocator(elementRecordByHostId, binding.hostNodeId),
		})),
		behaviorHostRecords: graph.behaviorProps.map((behavior) => ({
			...behavior,
			locator: requiredElementLocator(elementRecordByHostId, behavior.hostNodeId),
		})),
		branchAnchorRecords,
		keyedListRecords,
		emptyFallbackRecords,
		diagnostics: [],
	};
}

function addOwner(
	ownersByHostId: Map<string, Set<LocatorOwnerKind>>,
	hostNodeId: string,
	owner: LocatorOwnerKind,
): void {
	let owners = ownersByHostId.get(hostNodeId);
	if (!owners) {
		owners = new Set();
		ownersByHostId.set(hostNodeId, owners);
	}

	owners.add(owner);
}

function elementRecordFor(
	host: HostNode,
	ownersByHostId: ReadonlyMap<string, ReadonlySet<LocatorOwnerKind>>,
): ElementLocatorRecord {
	const owners = ownersByHostId.get(host.id) ?? new Set();

	return {
		kind: 'element',
		hostNodeId: host.id,
		tagName: host.tagName,
		owns: ownerOrder.filter((owner) => owners.has(owner)),
	};
}

function commentLocatorFor(
	anchorKind: CommentLocatorRecord['anchorKind'],
	ownerId: string,
	firstHostNodeId: string | null,
): CommentLocatorRecord {
	return {
		kind: 'comment',
		anchorKind,
		ownerId,
		firstHostNodeId,
	};
}

function buildLocatorStream(input: {
	readonly elementRecords: ReadonlyArray<ElementLocatorRecord>;
	readonly commentRecords: ReadonlyArray<CommentLocatorRecord>;
	readonly hostIndex: ReadonlyMap<string, number>;
}): PayloadLocatorStreamRecord[] {
	const entries: StreamEntry[] = [];

	for (const record of input.elementRecords) {
		entries.push({
			order: input.hostIndex.get(record.hostNodeId) ?? Number.MAX_SAFE_INTEGER,
			priority: 1,
			record,
		});
	}

	for (const record of input.commentRecords) {
		entries.push({
			order: record.firstHostNodeId ? (input.hostIndex.get(record.firstHostNodeId) ?? 0) : 0,
			priority: 0,
			record,
		});
	}

	entries.sort((left, right) => left.order - right.order || left.priority - right.priority);

	const stream: PayloadLocatorStreamRecord[] = [];
	let cursor = 0;

	for (const entry of entries) {
		if (entry.order > cursor) {
			stream.push({ kind: 'skip', count: entry.order - cursor });
			cursor = entry.order;
		}

		stream.push(entry.record);
		if (entry.record.kind === 'element') {
			cursor = entry.order + 1;
		}
	}

	return stream;
}

function requiredElementLocator(
	elementRecordByHostId: ReadonlyMap<string, ElementLocatorRecord>,
	hostNodeId: string,
): ElementLocatorRecord {
	const locator = elementRecordByHostId.get(hostNodeId);
	if (!locator) {
		throw new Error(`Missing element locator for host node ${hostNodeId}.`);
	}

	return locator;
}
