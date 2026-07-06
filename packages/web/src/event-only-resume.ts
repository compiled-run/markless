import type { ProtocolStatePayload, ProtocolViewPayload } from '../../serializer/src/protocol.ts';
import type { EventOnlyResumeGraph } from './event-only-graph.ts';
import type {
	CreateEventOnlyResumeContainerInput,
	EventOnlyResumeBehaviorRecord,
	EventOnlyResumeContainer,
	EventOnlyResumeDomElement,
	EventOnlyResumeDomEvent,
	EventOnlyResumeDomNode,
	EventOnlyResumeRecord,
	EventOnlyResumeSymbol,
	ResumeEventOnlyFromPayloadDocumentInput,
} from './event-only-lean/types.ts';

export type { EventOnlyResumeGraph } from './event-only-graph.ts';
export type {
	CreateEventOnlyResumeContainerInput,
	EventOnlyResumeBehaviorCleanup,
	EventOnlyResumeBehaviorRecord,
	EventOnlyResumeContainer,
	EventOnlyResumeDomElement,
	EventOnlyResumeDomEvent,
	EventOnlyResumeDomNode,
	EventOnlyResumeDomUpdateRecord,
	EventOnlyResumePayloadDocument,
	EventOnlyResumePayloadScriptElement,
	EventOnlyResumeRecord,
	EventOnlyResumeSymbol,
	EventOnlyResumeSymbolContext,
	ResumeEventOnlyFromPayloadDocumentInput,
} from './event-only-lean/types.ts';

type EventOnlyResumeContainerState = EventOnlyResumeContainer & {
	readonly elementsByHostId: ReadonlyMap<string, EventOnlyResumeDomElement>;
	readonly locatorsByHostId: ReadonlyMap<string, ProtocolViewPayload['locators'][number]>;
	readonly activeBehaviorHosts: Set<string>;
};

const containers = new WeakMap<EventOnlyResumeDomElement, EventOnlyResumeContainerState>();
const noElementHandle = () => undefined;

export async function resumeEventOnlyFromPayloadDocument(
	input: ResumeEventOnlyFromPayloadDocumentInput,
): Promise<EventOnlyResumeContainer> {
	let container = containers.get(input.root);
	if (!container) {
		const { decodePayloadScriptsFromDocument } = await import('./inline/payload-document.ts');
		const { state, view } = decodePayloadScriptsFromDocument(input.document);
		container = await createEventOnlyResumeContainerState({
			state,
			view,
			root: input.root,
			loadSymbol: input.loadSymbol,
		});
		containers.set(input.root, container);
	}

	await container.dispatch(input.event, {
		element: input.element,
		eventRecord: input.eventRecord,
		syncPolicyAlreadyApplied: input.syncPolicyAlreadyApplied,
	});
	return container;
}

export function createEventOnlyResumeContainerFromPayloads(
	input: CreateEventOnlyResumeContainerInput,
): Promise<EventOnlyResumeContainer> {
	return createEventOnlyResumeContainerState(input);
}

async function createEventOnlyResumeContainerState(
	input: CreateEventOnlyResumeContainerInput,
): Promise<EventOnlyResumeContainerState> {
	const elementsByHostId = new Map<string, EventOnlyResumeDomElement>();
	const locatorsByHostId = new Map(
		input.view.locators.map((locator) => [locator.hostNodeId, locator]),
	);
	const activeBehaviorHosts = new Set<string>();
	const resolveElementByHostId = (hostNodeId: string) =>
		materializeHostLocator({
			root: input.root,
			locatorsByHostId,
			elementsByHostId,
			hostNodeId,
		});
	const { createEventOnlyResumeGraph } = await import('./event-only-graph.ts');
	const graph = await createEventOnlyResumeGraph({
		state: input.state,
		view: input.view,
		loadSymbol: input.loadSymbol,
		root: input.root,
		elementsByHostId,
		resolveElementByHostId,
	});

	return {
		graph,
		view: input.view,
		elementsByHostId,
		locatorsByHostId,
		activeBehaviorHosts,
		dispatch(event, options = {}) {
			return dispatchEvent({
				event,
				view: input.view,
				graph,
				loadSymbol: input.loadSymbol,
				elementsByHostId,
				locatorsByHostId,
				root: input.root,
				activeBehaviorHosts,
				...options,
			});
		},
		dispose() {
			containers.delete(input.root);
			delete input.root.__marklessEventOnlyGraph;
			activeBehaviorHosts.clear();
		},
	};
}

async function dispatchEvent(input: {
	readonly event: EventOnlyResumeDomEvent;
	readonly view: ProtocolViewPayload;
	readonly graph: EventOnlyResumeGraph;
	readonly loadSymbol: ResumeEventOnlyFromPayloadDocumentInput['loadSymbol'];
	readonly elementsByHostId: Map<string, EventOnlyResumeDomElement>;
	readonly locatorsByHostId: ReadonlyMap<string, ProtocolViewPayload['locators'][number]>;
	readonly root: EventOnlyResumeDomElement;
	readonly activeBehaviorHosts: Set<string>;
	readonly element?: EventOnlyResumeDomElement;
	readonly eventRecord?: EventOnlyResumeRecord;
	readonly syncPolicyAlreadyApplied?: boolean;
}): Promise<void> {
	const matched = input.eventRecord
		? {
				element:
					input.element ??
					(await materializeHostLocator({
						root: input.root,
						locatorsByHostId: input.locatorsByHostId,
						elementsByHostId: input.elementsByHostId,
						hostNodeId: input.eventRecord.hostNodeId,
					})) ??
					input.event.target,
				eventRecord: input.eventRecord,
			}
		: await findEventRecord({
				target: input.event.target,
				eventName: input.event.type,
				view: input.view,
				root: input.root,
				locatorsByHostId: input.locatorsByHostId,
				elementsByHostId: input.elementsByHostId,
			});
	if (!matched?.element) return;

	let retryWithFullDecode = true;
	while (true) {
		try {
			if (matched.eventRecord.syncPolicy && !input.syncPolicyAlreadyApplied) {
				const { runSyncPolicyActions } = await import('./inline/sync-policy-core.ts');
				runSyncPolicyActions(
					matched.eventRecord.syncPolicy,
					input.graph,
					input.event,
				);
			}
			for (const symbolId of matched.eventRecord.symbolIds) {
				const loadedSymbol = input.loadSymbol(symbolId);
				const symbol = isPromiseLike(loadedSymbol) ? await loadedSymbol : loadedSymbol;
				const result = symbol({
					graph: input.graph,
					event: input.event,
					element: matched.element,
					getElementHandle: noElementHandle,
				});
				const journalResult = isPromiseLike(result) ? await result : result;
				if (typeof journalResult !== 'function') {
					const { applyDomJournalResult } = await import('./event-only-graph.ts');
					applyDomJournalResult(journalResult, input.elementsByHostId);
				}
			}
			await input.graph.flush();
			break;
		} catch (error) {
			if (!retryWithFullDecode || !isLeanGraphEscalation(error) || !input.graph.materializeAll) {
				throw error;
			}
			retryWithFullDecode = false;
			await input.graph.materializeAll();
		}
	}

	if (
		await hasPendingBehaviorHostForAncestor({
			element: matched.element,
			root: input.root,
			locatorsByHostId: input.locatorsByHostId,
			elementsByHostId: input.elementsByHostId,
			behaviors: input.view.behaviors,
			activeBehaviorHosts: input.activeBehaviorHosts,
		})
	) {
		const behaviorRuntime = await import('./event-only-behaviors.ts');
		await behaviorRuntime.activateBehaviorsFromEventHost({
			element: matched.element,
			view: input.view,
			graph: input.graph,
			loadSymbol: input.loadSymbol,
			elementsByHostId: input.elementsByHostId,
			activeBehaviorHosts: input.activeBehaviorHosts,
		});
	}
}

function isLeanGraphEscalation(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		(error as { readonly code?: unknown }).code === 'MARKLESS_EVENT_ONLY_LEAN_ESCALATE'
	);
}

async function hasPendingBehaviorHostForAncestor(input: {
	readonly element: EventOnlyResumeDomElement;
	readonly root: EventOnlyResumeDomElement;
	readonly locatorsByHostId: ReadonlyMap<string, ProtocolViewPayload['locators'][number]>;
	readonly elementsByHostId: Map<string, EventOnlyResumeDomElement>;
	readonly behaviors: ReadonlyArray<EventOnlyResumeBehaviorRecord>;
	readonly activeBehaviorHosts: ReadonlySet<string>;
}): Promise<boolean> {
	for (
		let current: EventOnlyResumeDomElement | null | undefined = input.element;
		current;
		current = current.parentElement
	) {
		for (const behavior of input.behaviors) {
			if (!behavior.symbolId || input.activeBehaviorHosts.has(behavior.hostNodeId)) continue;
			const element = await materializeHostLocator({
				root: input.root,
				locatorsByHostId: input.locatorsByHostId,
				elementsByHostId: input.elementsByHostId,
				hostNodeId: behavior.hostNodeId,
			});
			if (element === current) return true;
		}
	}
	return false;
}

async function materializeHostLocator(input: {
	readonly root: EventOnlyResumeDomElement;
	readonly locatorsByHostId: ReadonlyMap<string, ProtocolViewPayload['locators'][number]>;
	readonly elementsByHostId: Map<string, EventOnlyResumeDomElement>;
	readonly hostNodeId: string;
}): Promise<EventOnlyResumeDomElement | undefined> {
	const cached = input.elementsByHostId.get(input.hostNodeId);
	if (cached) return cached;
	const locator = input.locatorsByHostId.get(input.hostNodeId);
	if (!locator) return undefined;
	const element = findElementAtDomOrderIndex(input.root, locator.index);
	if (!element) {
		const { missingElementLocatorError } = await import('./inline/resume-errors.ts');
		throw missingElementLocatorError(locator);
	}
	if (
		locator.tagName !== '*' &&
		element.tagName.toLowerCase() !== locator.tagName.toLowerCase()
	) {
		const { mismatchedElementLocatorError } = await import('./inline/resume-errors.ts');
		throw mismatchedElementLocatorError(locator, element.tagName.toLowerCase());
	}
	input.elementsByHostId.set(input.hostNodeId, element);
	return element;
}

function findElementAtDomOrderIndex(
	root: EventOnlyResumeDomElement,
	index: number,
): EventOnlyResumeDomElement | undefined {
	let currentIndex = 0;
	let found: EventOnlyResumeDomElement | undefined;
	const visit = (node: EventOnlyResumeDomNode): void => {
		if (found) return;
		if (node.nodeType === 1) {
			if (currentIndex === index) {
				found = node as EventOnlyResumeDomElement;
				return;
			}
			currentIndex++;
		}
		for (const child of Array.from(node.childNodes ?? [])) visit(child);
	};
	visit(root);
	return found;
}

async function findEventRecord(input: {
	readonly target: EventOnlyResumeDomElement | null;
	readonly eventName: string;
	readonly view: ProtocolViewPayload;
	readonly root: EventOnlyResumeDomElement;
	readonly locatorsByHostId: ReadonlyMap<string, ProtocolViewPayload['locators'][number]>;
	readonly elementsByHostId: Map<string, EventOnlyResumeDomElement>;
}): Promise<
	| {
			readonly element: EventOnlyResumeDomElement;
			readonly eventRecord: EventOnlyResumeRecord;
	  }
	| undefined
> {
	for (let element = input.target; element; element = element.parentElement ?? null) {
		for (const eventRecord of input.view.events) {
			if (eventRecord.eventName !== input.eventName) continue;
			const host = await materializeHostLocator({
				root: input.root,
				locatorsByHostId: input.locatorsByHostId,
				elementsByHostId: input.elementsByHostId,
				hostNodeId: eventRecord.hostNodeId,
			});
			if (host === element) {
				return { element, eventRecord };
			}
		}
	}
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
	return (
		value !== null &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof (value as { readonly then?: unknown }).then === 'function'
	);
}
