import type { ProtocolStatePayload, ProtocolViewPayload } from '../../serializer/src/protocol.ts';
import type { DomJournalResult } from '@markless/runtime';
import type { EventOnlyResumeGraph } from './event-only-graph.ts';

export type EventOnlyResumeDomNode = {
	readonly nodeType: number;
	readonly childNodes?: ArrayLike<EventOnlyResumeDomNode>;
};

export type EventOnlyResumeDomElement = EventOnlyResumeDomNode & {
	readonly nodeType: 1;
	readonly tagName: string;
	readonly parentElement?: EventOnlyResumeDomElement | null;
	textContent?: string | null;
	addEventListener?: (
		type: string,
		listener: (event: EventOnlyResumeDomEvent) => Promise<void>,
		options?: { readonly capture?: boolean },
	) => void;
	removeEventListener?: (
		type: string,
		listener: (event: EventOnlyResumeDomEvent) => Promise<void>,
		options?: { readonly capture?: boolean },
	) => void;
	setAttribute?: (name: string, value: string) => void;
	removeAttribute?: (name: string) => void;
	__marklessEventOnlyGraph?: Map<string, unknown>;
	__asyncResumeRuntimeStarted?: boolean;
	readonly [name: string]: unknown;
};

export type EventOnlyResumeDomEvent = {
	readonly type: string;
	readonly target: EventOnlyResumeDomElement | null;
	readonly preventDefault?: () => void;
	readonly stopPropagation?: () => void;
	readonly [key: string]: unknown;
};

export type EventOnlyResumePayloadScriptElement = {
	readonly textContent?: string | null;
	readonly text?: string | null;
	readonly innerHTML?: string | null;
};

export type EventOnlyResumePayloadDocument = {
	readonly querySelector: (selector: string) => EventOnlyResumePayloadScriptElement | null;
};

export type EventOnlyResumeRecord = ProtocolViewPayload['events'][number];
export type EventOnlyResumeDomUpdateRecord = ProtocolViewPayload['domUpdates'][number];
export type EventOnlyResumeBehaviorRecord = ProtocolViewPayload['behaviors'][number];

export type { EventOnlyResumeGraph } from './event-only-graph.ts';

export type EventOnlyResumeSymbolContext = {
	readonly graph: EventOnlyResumeGraph;
	readonly event?: EventOnlyResumeDomEvent;
	readonly element: EventOnlyResumeDomElement;
	readonly getElementHandle: () => undefined;
	readonly domUpdate?: EventOnlyResumeDomUpdateRecord;
	readonly locals?: Readonly<Record<string, unknown>>;
	readonly value?: unknown;
	readonly behaviorInputs?: ReadonlyArray<unknown>;
};

export type EventOnlyResumeBehaviorCleanup = () => void;

export type EventOnlyResumeSymbol = (
	context: EventOnlyResumeSymbolContext,
) =>
	| void
	| DomJournalResult
	| EventOnlyResumeBehaviorCleanup
	| Promise<void | DomJournalResult | EventOnlyResumeBehaviorCleanup>;

export type ResumeEventOnlyFromPayloadDocumentInput = {
	readonly document: EventOnlyResumePayloadDocument;
	readonly root: EventOnlyResumeDomElement;
	readonly event: EventOnlyResumeDomEvent;
	readonly element?: EventOnlyResumeDomElement;
	readonly eventRecord?: EventOnlyResumeRecord;
	readonly loadSymbol: (
		symbolId: string,
	) => EventOnlyResumeSymbol | Promise<EventOnlyResumeSymbol>;
};

export type CreateEventOnlyResumeContainerInput = {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
	readonly root: EventOnlyResumeDomElement;
	readonly loadSymbol: ResumeEventOnlyFromPayloadDocumentInput['loadSymbol'];
};

export type EventOnlyResumeContainer = {
	readonly graph: EventOnlyResumeGraph;
	readonly view: ProtocolViewPayload;
	readonly dispatch: (
		event: EventOnlyResumeDomEvent,
		options?: {
			readonly element?: EventOnlyResumeDomElement;
			readonly eventRecord?: EventOnlyResumeRecord;
		},
	) => Promise<void>;
	readonly dispose: () => void;
};

type EventOnlyResumeContainerState = EventOnlyResumeContainer & {
	readonly elementsByHostId: ReadonlyMap<string, EventOnlyResumeDomElement>;
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
	const elementsByHostId = await materializeDomLocators(input.root, input.view.locators);
	const activeBehaviorHosts = new Set<string>();
	const { createEventOnlyResumeGraph } = await import('./event-only-graph.ts');
	const graph = await createEventOnlyResumeGraph({
		state: input.state,
		view: input.view,
		loadSymbol: input.loadSymbol,
		root: input.root,
		elementsByHostId,
	});

	return {
		graph,
		view: input.view,
		elementsByHostId,
		activeBehaviorHosts,
		dispatch(event, options = {}) {
			return dispatchEvent({
				event,
				view: input.view,
				graph,
				loadSymbol: input.loadSymbol,
				elementsByHostId,
				activeBehaviorHosts,
				element: options.element,
				eventRecord: options.eventRecord,
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
	readonly elementsByHostId: ReadonlyMap<string, EventOnlyResumeDomElement>;
	readonly activeBehaviorHosts: Set<string>;
	readonly element?: EventOnlyResumeDomElement;
	readonly eventRecord?: EventOnlyResumeRecord;
}): Promise<void> {
	const matched = input.eventRecord
		? {
				element:
					input.element ??
					input.elementsByHostId.get(input.eventRecord.hostNodeId) ??
					input.event.target,
				eventRecord: input.eventRecord,
			}
		: findEventRecord(input.event.target, input.event.type, input.view, input.elementsByHostId);
	if (!matched?.element) return;

	try {
		if (matched.eventRecord.syncPolicy) {
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
	} finally {
		await input.graph.flush();
	}

	if (input.view.behaviors.some((behavior) => !!behavior.symbolId)) {
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

async function materializeDomLocators(
	root: EventOnlyResumeDomElement,
	locators: ProtocolViewPayload['locators'],
): Promise<Map<string, EventOnlyResumeDomElement>> {
	const elements = collectElements(root);
	const byHostId = new Map<string, EventOnlyResumeDomElement>();

	for (const locator of locators) {
		const element = elements[locator.index];
		if (!element) {
			const { missingElementLocatorError } = await import('./inline/resume-errors.ts');
			throw missingElementLocatorError(locator);
		}
		// '*' marks dynamic-tag hosts whose rendered tag is unknowable at
		// compile time; skip validation like the full resume runtime does.
		if (
			locator.tagName !== '*' &&
			element.tagName.toLowerCase() !== locator.tagName.toLowerCase()
		) {
			const { mismatchedElementLocatorError } = await import('./inline/resume-errors.ts');
			throw mismatchedElementLocatorError(locator, element.tagName.toLowerCase());
		}
		byHostId.set(locator.hostNodeId, element);
	}

	return byHostId;
}

function collectElements(root: EventOnlyResumeDomElement): EventOnlyResumeDomElement[] {
	const elements: EventOnlyResumeDomElement[] = [];
	const visit = (node: EventOnlyResumeDomNode): void => {
		if (node.nodeType === 1) elements.push(node as EventOnlyResumeDomElement);
		for (const child of Array.from(node.childNodes ?? [])) visit(child);
	};
	visit(root);
	return elements;
}

function findEventRecord(
	target: EventOnlyResumeDomElement | null,
	eventName: string,
	view: ProtocolViewPayload,
	elementsByHostId: ReadonlyMap<string, EventOnlyResumeDomElement>,
):
	| {
			readonly element: EventOnlyResumeDomElement;
			readonly eventRecord: EventOnlyResumeRecord;
	  }
	| undefined {
	for (let element = target; element; element = element.parentElement ?? null) {
		for (const eventRecord of view.events) {
			if (eventRecord.eventName !== eventName) continue;
			if (elementsByHostId.get(eventRecord.hostNodeId) === element) {
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
