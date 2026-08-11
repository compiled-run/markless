import type { ProtocolViewPayload } from '../../../serializer/src/protocol.ts';
import type { DomJournalResult } from '@markless/runtime';
import type { ResumeSymbolContext } from '../resume-types.ts';
import type { RuntimeGraphCall, RuntimeGraphUpdate, RuntimeGraphWrite } from '@markless/runtime';

export type EventOnlyResumeGraph = {
	read(graphNodeId: string, path?: ReadonlyArray<string>): unknown;
	write(write: RuntimeGraphWrite): void;
	update(update: RuntimeGraphUpdate): unknown;
	call(call: RuntimeGraphCall): unknown;
	flush(): Promise<void>;
};

export type EventOnlyResumeDomNode = {
	readonly nodeType: number;
	readonly childNodes?: ReadonlyArray<EventOnlyResumeDomNode>;
};

export type EventOnlyResumeDomElement = EventOnlyResumeDomNode & {
	readonly nodeType: 1;
	readonly tagName: string;
	readonly parentElement?: EventOnlyResumeDomElement | null;
	textContent?: string | null;
	addEventListener?: (
		type: string,
		listener: (event: EventOnlyResumeDomEvent) => void | Promise<void>,
		options?: { readonly capture?: boolean },
	) => void;
	removeEventListener?: (
		type: string,
		listener: (event: EventOnlyResumeDomEvent) => void | Promise<void>,
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
	// Lean resume owns no element handles, but the symbol contract it shares with
	// full resume is the one the compiled symbol is typed against.
	readonly getElementHandle: (handleIdOrName: string) => EventOnlyResumeDomElement | undefined;
	readonly domUpdate?: EventOnlyResumeDomUpdateRecord;
	readonly locals?: Readonly<Record<string, unknown>>;
	readonly value?: unknown;
	readonly behaviorInputs?: ReadonlyArray<unknown>;
	readonly args?: ReadonlyArray<unknown>;
	readonly invokeCallback?: (symbolId: string, args: ReadonlyArray<unknown>) => Promise<unknown>;
	readonly invokeSymbol?: (
		symbolId: string,
		context: ResumeSymbolContext,
	) => Promise<unknown>;
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
	readonly runtimeDemandMap?: unknown;
	readonly syncPolicyAlreadyApplied?: boolean;
	readonly loadSymbol: (
		symbolId: string,
	) => EventOnlyResumeSymbol | Promise<EventOnlyResumeSymbol>;
	readonly loadFullResume?: (input: ResumeEventOnlyFromPayloadDocumentInput) => unknown;
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
