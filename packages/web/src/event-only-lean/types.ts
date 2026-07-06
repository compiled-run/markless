import type { ProtocolStatePayload, ProtocolViewPayload } from '../../../serializer/src/protocol.ts';
import type { DomJournalResult } from '@markless/runtime';
import type { EventOnlyResumeGraph } from '../event-only-graph.ts';

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
	readonly syncPolicyAlreadyApplied?: boolean;
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
			readonly syncPolicyAlreadyApplied?: boolean;
		},
	) => Promise<void>;
	readonly dispose: () => void;
};
