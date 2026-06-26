import type {
	EventOnlyResumeBehaviorRecord,
	EventOnlyResumeDomElement,
	EventOnlyResumeGraph,
	ResumeEventOnlyFromPayloadDocumentInput,
} from './event-only-resume.ts';

export async function activateBehaviorsFromEventHost(input: {
	readonly element: EventOnlyResumeDomElement;
	readonly view: {
		readonly behaviors: ReadonlyArray<EventOnlyResumeBehaviorRecord>;
	};
	readonly graph: EventOnlyResumeGraph;
	readonly loadSymbol: ResumeEventOnlyFromPayloadDocumentInput['loadSymbol'];
	readonly elementsByHostId: ReadonlyMap<string, EventOnlyResumeDomElement>;
	readonly activeBehaviorHosts: Set<string>;
}): Promise<void> {
	for (const hostNodeId of hostNodeIdsForAncestors(input.element, input.elementsByHostId)) {
		if (input.activeBehaviorHosts.has(hostNodeId)) continue;

		const behaviorRecords = input.view.behaviors.filter(
			(behavior) => behavior.hostNodeId === hostNodeId && behavior.symbolId,
		);
		if (behaviorRecords.length === 0) continue;

		const element = input.elementsByHostId.get(hostNodeId);
		if (!element) continue;

		input.activeBehaviorHosts.add(hostNodeId);
		for (const behaviorRecord of behaviorRecords) {
			await runBehavior({
				behaviorRecord,
				element,
				graph: input.graph,
				loadSymbol: input.loadSymbol,
			});
		}
	}

	await input.graph.flush();
}

async function runBehavior(input: {
	readonly behaviorRecord: EventOnlyResumeBehaviorRecord;
	readonly element: EventOnlyResumeDomElement;
	readonly graph: EventOnlyResumeGraph;
	readonly loadSymbol: ResumeEventOnlyFromPayloadDocumentInput['loadSymbol'];
}): Promise<void> {
	if (!input.behaviorRecord.symbolId) return;

	const loadedSymbol = input.loadSymbol(input.behaviorRecord.symbolId);
	const symbol = isPromiseLike(loadedSymbol) ? await loadedSymbol : loadedSymbol;
	const result = symbol({
		graph: input.graph,
		element: input.element,
		getElementHandle: () => undefined,
		behaviorInputs: behaviorInputs(input.behaviorRecord, input.graph),
	});
	if (isPromiseLike(result)) await result;
}

function behaviorInputs(
	behaviorRecord: EventOnlyResumeBehaviorRecord,
	graph: EventOnlyResumeGraph,
): ReadonlyArray<unknown> {
	const graphReads = behaviorRecord.inputGraphReads ?? [];
	const inputCount = Math.max(
		behaviorRecord.inputSources.length,
		...graphReads.map((read) => read.inputIndex + 1),
	);
	const inputs =
		behaviorRecord.inputValues !== undefined
			? [...behaviorRecord.inputValues]
			: Array.from({ length: inputCount }, () => undefined);

	for (const graphRead of graphReads) {
		inputs[graphRead.inputIndex] = graph.read(graphRead.graphNodeId, graphRead.path);
	}

	return inputs;
}

function hostNodeIdsForAncestors(
	element: EventOnlyResumeDomElement,
	elementsByHostId: ReadonlyMap<string, EventOnlyResumeDomElement>,
): string[] {
	const hostNodeIds: string[] = [];
	for (
		let current: EventOnlyResumeDomElement | null | undefined = element;
		current;
		current = current.parentElement
	) {
		for (const [hostNodeId, hostElement] of elementsByHostId) {
			if (hostElement === current) hostNodeIds.push(hostNodeId);
		}
	}
	return hostNodeIds;
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
	return (
		value !== null &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof (value as { readonly then?: unknown }).then === 'function'
	);
}
