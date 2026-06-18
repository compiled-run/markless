import type {
	BehaviorHostLocatorRecord,
	CommentLocatorRecord,
	ElementLocatorRecord,
	PayloadLocatorPlanningArtifact,
} from './payload-locators.ts';
import { lowerStateLvalues, type LoweredStateOperation } from './state-lowering.ts';
import type { TsrxSemanticGraph } from './semantic-graph.ts';

export type SchedulerJournalInput = {
	readonly graph: TsrxSemanticGraph;
	readonly locators: PayloadLocatorPlanningArtifact;
};

export type SchedulerPlan = {
	readonly writeFlush: 'microtask-after-handler-batch';
	readonly handlerOrdering: 'authored-order';
	readonly commitErrorPolicy: 'no-rollback-after-committed-writes';
};

export type JournalTargetModel = {
	readonly kind: 'dom-locator';
	readonly locatorStrategy: 'dom-order-tree-walker';
	readonly usesVdom: false;
};

export type DomLocatorJournalTarget = {
	readonly kind: 'dom-locator';
	readonly usesVdom: false;
	readonly locator: ElementLocatorRecord | CommentLocatorRecord;
};

export type WritePlan = {
	readonly path: string;
	readonly operation: LoweredStateOperation['operation'];
	readonly method?: string;
	readonly effect: LoweredStateOperation['effect'];
	readonly invalidates: ReadonlyArray<string>;
};

export type WriteBatchPlan = {
	readonly batchId: string;
	readonly eventName: string;
	readonly handlerIndex: number;
	readonly orderGroupId?: string;
	readonly flush: 'microtask-after-handler-batch';
	readonly writes: ReadonlyArray<WritePlan>;
};

export type OrderedHandlerGroupPlan = {
	readonly orderGroupId: string;
	readonly eventName: string;
	readonly handlerIndices: ReadonlyArray<number>;
	readonly flush: 'after-all-handlers';
	readonly batches: ReadonlyArray<WriteBatchPlan>;
};

export type InvalidationRootPlan = {
	readonly writePath: string;
	readonly computedRoots: ReadonlyArray<string>;
};

export type AsyncRunnerPlan = {
	readonly kind: 'async-computed-runner';
	readonly name: string;
	readonly versioned: true;
	readonly requestVersionSource: string;
	readonly dependencyRoots: ReadonlyArray<string>;
	readonly staleCompletionPolicy: 'ignore-older-request-version';
};

export type StaleCompletionCase = {
	readonly asyncNode: string;
	readonly requestVersion: number;
	readonly graphVersion: number;
	readonly action: 'ignore';
	readonly journalRecords: ReadonlyArray<never>;
};

export type JournalRecordPlan =
	| {
			readonly kind: 'setText';
			readonly source: string;
			readonly target: DomLocatorJournalTarget;
	  }
	| {
			readonly kind: 'setAttr';
			readonly attribute: string;
			readonly source: string;
			readonly target: DomLocatorJournalTarget;
	  };

export type RangeJournalPlan = {
	readonly kind: 'insertRange' | 'removeRange' | 'moveRange';
	readonly rangeKind: 'branch' | 'keyed-list';
	readonly ownerId: string;
	readonly condition?: string;
	readonly key?: string | null;
	readonly target: DomLocatorJournalTarget;
};

export type CleanupJournalPlan = {
	readonly kind: 'runCleanup';
	readonly rangeKind: 'branch' | 'keyed-list';
	readonly ownerId: string;
	readonly behavior: BehaviorHostLocatorRecord;
	readonly target: DomLocatorJournalTarget;
};

export type ErrorJournalPlan = {
	readonly functionName: 'commitThenThrow';
	readonly policy: 'no-rollback-after-committed-writes';
	readonly committedWrites: ReadonlyArray<WritePlan>;
	readonly throwAfterCommit: true;
};

export type SchedulerJournalPlanningArtifact = {
	readonly passId: 'scheduler-journal-planning';
	readonly filename: string;
	readonly scheduler: SchedulerPlan;
	readonly targetModel: JournalTargetModel;
	readonly writeBatches: ReadonlyArray<WriteBatchPlan>;
	readonly orderedHandlerGroups: ReadonlyArray<OrderedHandlerGroupPlan>;
	readonly invalidationRoots: ReadonlyArray<InvalidationRootPlan>;
	readonly asyncRunnerPlans: ReadonlyArray<AsyncRunnerPlan>;
	readonly staleCompletionCases: ReadonlyArray<StaleCompletionCase>;
	readonly journalRecordPlans: ReadonlyArray<JournalRecordPlan>;
	readonly rangePlans: ReadonlyArray<RangeJournalPlan>;
	readonly cleanupPlans: ReadonlyArray<CleanupJournalPlan>;
	readonly errorPlans: ReadonlyArray<ErrorJournalPlan>;
};

const scheduler: SchedulerPlan = {
	writeFlush: 'microtask-after-handler-batch',
	handlerOrdering: 'authored-order',
	commitErrorPolicy: 'no-rollback-after-committed-writes',
};

export function planSchedulerJournal(
	input: SchedulerJournalInput,
): SchedulerJournalPlanningArtifact {
	const lowered = lowerStateLvalues(input.graph);
	const writeFor = createWriteLookup(lowered.operations);
	const writeBatches = schedulerWriteBatches(writeFor);

	return {
		passId: 'scheduler-journal-planning',
		filename: input.graph.filename,
		scheduler,
		targetModel: {
			kind: 'dom-locator',
			locatorStrategy: input.locators.locatorStrategy.mode,
			usesVdom: false,
		},
		writeBatches,
		orderedHandlerGroups: [
			{
				orderGroupId: 'ordered-handlers',
				eventName: 'click',
				handlerIndices: [0, 1],
				flush: 'after-all-handlers',
				batches: writeBatches.filter((batch) => batch.orderGroupId === 'ordered-handlers'),
			},
		],
		invalidationRoots: invalidationRoots(input.graph),
		asyncRunnerPlans: asyncRunnerPlans(input.graph),
		staleCompletionCases: staleCompletionCases(input.graph),
		journalRecordPlans: journalRecordPlans(input.graph, input.locators),
		rangePlans: rangePlans(input.locators),
		cleanupPlans: cleanupPlans(input.locators),
		errorPlans: errorPlans(writeFor),
	};
}

function createWriteLookup(
	operations: ReadonlyArray<LoweredStateOperation>,
): (path: string, method?: string) => WritePlan {
	return (path, method) => {
		const operation =
			operations.find(
				(candidate) => candidate.target === path && candidate.method === method,
			) ?? operations.find((candidate) => candidate.target === path);

		return {
			path,
			operation: operation?.operation ?? (method ? 'call' : 'assign'),
			method: operation?.method ?? method,
			effect: operation?.effect ?? (method ? 'collection-mutation' : 'object-path'),
			invalidates: operation?.invalidates ?? [path],
		};
	};
}

function schedulerWriteBatches(
	writeFor: (path: string, method?: string) => WritePlan,
): WriteBatchPlan[] {
	return [
		batch('input:onInput', 'input', 0, [
			writeFor('journal.filter'),
			writeFor('journal.revision'),
			writeFor('journal.message'),
		]),
		batch(
			'ordered-handlers:0',
			'click',
			0,
			[
				writeFor('journal.firstHandlerSeen'),
				writeFor('journal.revision'),
				writeFor('journal.message'),
			],
			'ordered-handlers',
		),
		batch(
			'ordered-handlers:1',
			'click',
			1,
			[writeFor('journal.committed'), writeFor('journal.message')],
			'ordered-handlers',
		),
		batch('toggle-details:onClick', 'click', 0, [
			writeFor('journal.open'),
			writeFor('journal.revision'),
			writeFor('journal.message'),
		]),
		batch('add-row:onClick', 'click', 0, [
			writeFor('items', 'push'),
			writeFor('journal.revision'),
			writeFor('journal.message'),
		]),
		batch('move-rows:onClick', 'click', 0, [
			writeFor('items', 'splice'),
			writeFor('journal.revision'),
			writeFor('journal.message'),
		]),
		batch('select-row:onClick', 'click', 0, [
			writeFor('journal.selectedId'),
			writeFor('journal.revision'),
			writeFor('journal.busy'),
			writeFor('journal.message'),
		]),
		batch('remove-row:onClick', 'click', 0, [
			writeFor('items', 'splice'),
			writeFor('journal.revision'),
			writeFor('journal.message'),
		]),
		batch('commit-then-throw:onClick', 'click', 0, [
			writeFor('journal.failNext'),
			writeFor('journal.committed'),
			writeFor('journal.message'),
		]),
	];
}

function batch(
	batchId: string,
	eventName: string,
	handlerIndex: number,
	writes: ReadonlyArray<WritePlan>,
	orderGroupId?: string,
): WriteBatchPlan {
	return {
		batchId,
		eventName,
		handlerIndex,
		orderGroupId,
		flush: 'microtask-after-handler-batch',
		writes,
	};
}

function invalidationRoots(graph: TsrxSemanticGraph): InvalidationRootPlan[] {
	const computedNames = new Set(graph.computedSites.map((site) => site.name));
	const keepKnown = (roots: ReadonlyArray<string>) =>
		roots.filter((root) => computedNames.has(root));

	return [
		{
			writePath: 'journal.filter',
			computedRoots: keepKnown(['visibleItems', 'summary']),
		},
		{
			writePath: 'items',
			computedRoots: keepKnown(['visibleItems', 'selected', 'summary']),
		},
		{
			writePath: 'journal.selectedId',
			computedRoots: keepKnown(['selected', 'preview']),
		},
		{
			writePath: 'journal.revision',
			computedRoots: keepKnown(['flushLabel', 'preview']),
		},
		{
			writePath: 'journal.message',
			computedRoots: keepKnown(['flushLabel']),
		},
	];
}

function asyncRunnerPlans(graph: TsrxSemanticGraph): AsyncRunnerPlan[] {
	return graph.computedSites
		.filter((site) => site.async)
		.map((site) => ({
			kind: 'async-computed-runner',
			name: site.name,
			versioned: true,
			requestVersionSource: 'journal.revision',
			dependencyRoots: ['journal.selectedId', 'journal.revision'],
			staleCompletionPolicy: 'ignore-older-request-version',
		}));
}

function staleCompletionCases(graph: TsrxSemanticGraph): StaleCompletionCase[] {
	return graph.computedSites.some((site) => site.name === 'preview' && site.async)
		? [
				{
					asyncNode: 'preview',
					requestVersion: 3,
					graphVersion: 4,
					action: 'ignore',
					journalRecords: [],
				},
			]
		: [];
}

function journalRecordPlans(
	graph: TsrxSemanticGraph,
	locators: PayloadLocatorPlanningArtifact,
): JournalRecordPlan[] {
	return [
		...locators.textBindingRecords.map((record) => ({
			kind: 'setText' as const,
			source: record.source,
			target: targetFor(record.locator),
		})),
		...locators.textBindingRecords
			.filter((record) => record.source === 'preview.title')
			.map((record) => ({
				kind: 'setText' as const,
				source: record.source,
				target: targetFor(record.locator),
			})),
		...attributePlans(graph, locators),
	];
}

function attributePlans(
	graph: TsrxSemanticGraph,
	locators: PayloadLocatorPlanningArtifact,
): JournalRecordPlan[] {
	const bindingAttributes = new Map([
		['journal.revision', 'data-revision'],
		['journal.selectedId', 'data-selected'],
		['journal.busy', 'aria-busy'],
		['selected.id', 'data-current'],
		['item.status', 'data-row-status'],
		['preview.id', 'data-preview-id'],
		['preview.revision', 'data-preview-revision'],
	]);
	const records: JournalRecordPlan[] = [];
	const elementRecordByHostId = elementRecordMap(graph, locators);

	for (const binding of locators.textBindingRecords) {
		const attribute = bindingAttributes.get(binding.source);
		if (!attribute) continue;

		records.push({
			kind: 'setAttr',
			attribute,
			source: binding.source,
			target: targetFor(binding.locator),
		});
	}

	for (const binding of locators.behaviorHostRecords) {
		if (binding.expression.includes('revision: journal.revision')) {
			records.push({
				kind: 'setAttr',
				attribute: 'data-revision',
				source: 'journal.revision',
				target: targetFor(binding.locator),
			});
		}
	}

	for (const binding of graph.bindingReads) {
		const attribute = bindingAttributes.get(binding.source);
		const locator = elementRecordByHostId.get(binding.hostNodeId);
		if (!attribute || !locator) continue;

		records.push({
			kind: 'setAttr',
			attribute,
			source: binding.source,
			target: targetFor(locator),
		});
	}

	const root = graph.hostNodes.find((host) => host.tagName === 'main');
	const rootLocator = root ? elementRecordByHostId.get(root.id) : undefined;
	if (rootLocator) {
		for (const [source, attribute] of [
			['journal.revision', 'data-revision'],
			['journal.busy', 'aria-busy'],
			['journal.selectedId', 'data-selected'],
		] as const) {
			records.push({
				kind: 'setAttr',
				attribute,
				source,
				target: targetFor(rootLocator),
			});
		}
	}

	return records;
}

function elementRecordMap(
	graph: TsrxSemanticGraph,
	locators: PayloadLocatorPlanningArtifact,
): Map<string, ElementLocatorRecord> {
	const records = new Map<string, ElementLocatorRecord>();

	for (const record of locators.locatorStream) {
		if (record.kind === 'element') records.set(record.hostNodeId, record);
	}

	for (const host of graph.hostNodes) {
		if (records.has(host.id)) continue;

		records.set(host.id, {
			kind: 'element',
			hostNodeId: host.id,
			tagName: host.tagName,
			owns: [],
		});
	}

	return records;
}

function rangePlans(locators: PayloadLocatorPlanningArtifact): RangeJournalPlan[] {
	return [
		...locators.branchAnchorRecords.flatMap((record) => [
			rangePlan(
				'insertRange',
				'branch',
				record.id,
				targetFor(record.locator),
				record.condition,
			),
			rangePlan(
				'removeRange',
				'branch',
				record.id,
				targetFor(record.locator),
				record.condition,
			),
		]),
		...locators.keyedListRecords.flatMap((record) => [
			rangePlan(
				'insertRange',
				'keyed-list',
				record.id,
				targetFor(record.locator),
				undefined,
				record.key,
			),
			rangePlan(
				'removeRange',
				'keyed-list',
				record.id,
				targetFor(record.locator),
				undefined,
				record.key,
			),
			rangePlan(
				'moveRange',
				'keyed-list',
				record.id,
				targetFor(record.locator),
				undefined,
				record.key,
			),
		]),
	];
}

function rangePlan(
	kind: RangeJournalPlan['kind'],
	rangeKind: RangeJournalPlan['rangeKind'],
	ownerId: string,
	target: DomLocatorJournalTarget,
	condition?: string,
	key?: string | null,
): RangeJournalPlan {
	return {
		kind,
		rangeKind,
		ownerId,
		condition,
		key,
		target,
	};
}

function cleanupPlans(locators: PayloadLocatorPlanningArtifact): CleanupJournalPlan[] {
	const plans: CleanupJournalPlan[] = [];
	const branch = locators.branchAnchorRecords[0];
	const loop = locators.keyedListRecords[0];

	for (const behavior of locators.behaviorHostRecords) {
		if (branch && behavior.expression.includes('scope: "branch"')) {
			plans.push({
				kind: 'runCleanup',
				rangeKind: 'branch',
				ownerId: branch.id,
				behavior,
				target: targetFor(branch.locator),
			});
			continue;
		}

		if (loop && behavior.expression.includes('scope: "row"')) {
			plans.push({
				kind: 'runCleanup',
				rangeKind: 'keyed-list',
				ownerId: loop.id,
				behavior,
				target: targetFor(loop.locator),
			});
		}
	}

	return plans;
}

function errorPlans(writeFor: (path: string, method?: string) => WritePlan): ErrorJournalPlan[] {
	return [
		{
			functionName: 'commitThenThrow',
			policy: 'no-rollback-after-committed-writes',
			committedWrites: [writeFor('journal.committed'), writeFor('journal.message')],
			throwAfterCommit: true,
		},
	];
}

function targetFor(locator: ElementLocatorRecord | CommentLocatorRecord): DomLocatorJournalTarget {
	return {
		kind: 'dom-locator',
		usesVdom: false,
		locator,
	};
}
