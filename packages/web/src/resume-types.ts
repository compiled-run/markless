import type { ProtocolStatePayload, ProtocolViewPayload } from '@markless/serializer';
import type { DomJournalResult, RuntimeGraph, RuntimeGraphSharedPatch } from '@markless/runtime';

export type ResumeDomNode = {
	readonly nodeType: number;
	readonly childNodes?: ReadonlyArray<ResumeDomNode>;
};
export type ResumeDomElement = ResumeDomNode & {
	readonly nodeType: 1;
	readonly tagName: string;
	readonly childNodes?: ReadonlyArray<ResumeDomNode>;
	readonly parentElement?: ResumeDomElement | null;
	readonly addEventListener?: (
		type: string,
		listener: (event: ResumeDomEvent) => Promise<void>,
		options?: { readonly capture?: boolean },
	) => void;
	readonly removeEventListener?: (
		type: string,
		listener: (event: ResumeDomEvent) => Promise<void>,
		options?: { readonly capture?: boolean },
	) => void;
	readonly dispatchEvent?: (event: ResumeSharedPatchEvent) => boolean;
};
export type ResumeDomComment = ResumeDomNode & { readonly nodeType: 8; readonly data?: string };
export type ResumeDomEvent = {
	readonly type: string;
	readonly target: ResumeDomElement | null;
	readonly [key: string]: unknown;
	readonly preventDefault?: () => void;
	readonly stopPropagation?: () => void;
};
export type ResumeSharedPatchEvent = {
	readonly type: 'async:shared-patch';
	readonly detail: RuntimeGraphSharedPatch;
	readonly bubbles: true;
	readonly cancelable: false;
	readonly composed: true;
};
export type ResumeVisibilityEntry = {
	readonly target: ResumeDomElement;
	readonly isIntersecting?: boolean;
	readonly intersectionRatio?: number;
};
export type ResumeVisibilityObserver = {
	readonly observe: (element: ResumeDomElement) => void;
	readonly unobserve?: (element: ResumeDomElement) => void;
	readonly disconnect?: () => void;
};
export type ResumeVisibilityObserverFactory = (
	callback: (entries: ReadonlyArray<ResumeVisibilityEntry>) => void,
) => ResumeVisibilityObserver;
export type ResumeRemovalRecord = { readonly removedNodes: Iterable<ResumeDomNode> };
export type ResumeRemovalObserver = {
	readonly observe: (
		element: ResumeDomElement,
		options?: { readonly childList?: boolean; readonly subtree?: boolean },
	) => void;
	readonly disconnect?: () => void;
};
export type ResumeRemovalObserverFactory = (
	callback: (records: ReadonlyArray<ResumeRemovalRecord>) => void,
) => ResumeRemovalObserver;
export type ResumeEventRecord = ProtocolViewPayload['events'][number];
export type ResumeAsyncBoundaryRead =
	ProtocolViewPayload['asyncBoundaries'][number]['asyncReads'][number];
export type ResumeAsyncBoundaryRecord = {
	readonly id: string;
	readonly updateSymbolId?: string;
	readonly startAnchor: ResumeDomComment;
	readonly endAnchor: ResumeDomComment;
	readonly asyncReads: ProtocolViewPayload['asyncBoundaries'][number]['asyncReads'];
};
export type ResumeBehaviorRecord = ProtocolViewPayload['behaviors'][number];
export type ResumeKeyedRepeatRecord = NonNullable<ProtocolViewPayload['keyedRepeats']>[number];
export type ResumeKeyedRepeatRowEvent = ResumeKeyedRepeatRecord['rowEvents'][number];
export type ResumeBranchArmRecordSet = NonNullable<
	NonNullable<ProtocolViewPayload['branches']>[number]['armRecords']
>[number];
export type ResumeBranchRecord = {
	readonly id: string;
	readonly sourceId?: string;
	readonly startAnchor: ResumeDomComment;
	readonly endAnchor: ResumeDomComment;
	readonly symbolId: string;
	readonly testReads: NonNullable<
		NonNullable<ProtocolViewPayload['branches']>[number]['testReads']
	>;
	readonly armTests?: ReadonlyArray<unknown>;
	readonly declaredEmptyArms?: ReadonlyArray<number>;
	readonly armRecords?: ReadonlyArray<ResumeBranchArmRecordSet>;
};
export type ResumeBranchHtml = string | ReadonlyArray<string | { readonly text: string }>;
export type ResumeBranchUpdate = { readonly arm: number; readonly html: ResumeBranchHtml };
// D3: records for content inside an async boundary arm, indexed relative to
// the boundary's start anchor (0 = first element after it in the rendered
// arm). Registration adds the anchor's live element-walk offset, so one set
// stays valid on initial load and after an arm commit replaces the range.
export type ResumeArmLocator = {
	readonly hostNodeId: string;
	readonly strategy: 'arm-relative';
	readonly index: number;
	readonly tagName: string;
};
// An @if/@switch inside a boundary arm (D1 tier 3 in arms). Flip-capable
// records carry a flip symbol plus an anchor pair indexed in the boundary's
// OWN arm-branch comment census; escalated records (content needs component
// execution) omit them and route their test reads through the boundary's arm
// re-render. Materialization resolves the payload indexes to live comments.
export type ResumeArmBranchRecord = {
	readonly id: string;
	readonly testReads: NonNullable<
		NonNullable<ProtocolViewPayload['branches']>[number]['testReads']
	>;
	readonly symbolId?: string;
	readonly armTests?: ReadonlyArray<unknown>;
	readonly declaredEmptyArms?: ReadonlyArray<number>;
	readonly startAnchor?:
		| { readonly strategy: 'arm-branch-comment'; readonly index: number }
		| ResumeDomComment;
	readonly endAnchor?:
		| { readonly strategy: 'arm-branch-comment'; readonly index: number }
		| ResumeDomComment;
	readonly armRecords?: ReadonlyArray<ResumeBranchArmRecordSet>;
	// Present once the record is bound to its live boundary at registration.
	readonly armBoundaryId?: string;
};
export type ResumeArmRecordSet = {
	readonly locators: ReadonlyArray<ResumeArmLocator>;
	readonly events: ProtocolViewPayload['events'];
	readonly behaviors: ProtocolViewPayload['behaviors'];
	readonly elementHandles: ProtocolViewPayload['elementHandles'];
	readonly branches?: ReadonlyArray<ResumeArmBranchRecord>;
};
export type ResumeAsyncBoundaryPayload = ProtocolViewPayload['asyncBoundaries'][number] & {
	// A single armized set (SSR and CSR compose both armize live arms); a
	// compile-time per-arm array is a stale payload and is never registrable.
	readonly armRecords?: ResumeArmRecordSet | ReadonlyArray<unknown>;
};
export type ResumeViewRecord = Pick<
	ProtocolViewPayload,
	| 'locators'
	| 'events'
	| 'domUpdates'
	| 'behaviors'
	| 'elementHandles'
	| 'branches'
	| 'keyedRepeats'
> & {
	readonly asyncBoundaries: ReadonlyArray<ResumeAsyncBoundaryPayload>;
};
export type ResumeSymbolContext = {
	readonly graph: RuntimeGraph;
	readonly read?: RuntimeGraph['read'];
	readonly key?: unknown;
	readonly signal?: AbortSignal;
	readonly event?: ResumeDomEvent;
	readonly element: ResumeDomElement;
	readonly getElementHandle: (handleIdOrName: string) => ResumeDomElement | undefined;
	readonly locals?: Readonly<Record<string, unknown>>;
	readonly arm?: number;
	readonly branchId?: string;
	readonly composedBranchId?: string;
	readonly behaviorInputs?: ReadonlyArray<unknown>;
	readonly domUpdate?: ProtocolViewPayload['domUpdates'][number];
	readonly value?: unknown;
	readonly asyncBoundary?: ResumeAsyncBoundaryRecord;
	readonly asyncRead?: ResumeAsyncBoundaryRead;
	readonly status?: 'fulfilled' | 'rejected';
};
export type ResumeBehaviorCleanup = () => void;
export type ResumeSymbol = (
	context: ResumeSymbolContext,
) =>
	| void
	| DomJournalResult
	| ResumeBehaviorCleanup
	| ResumeBranchUpdate
	| Promise<void | DomJournalResult | ResumeBehaviorCleanup | ResumeBranchUpdate>;
export type ResumeRuntimeErrorContext =
	| {
			readonly phase: 'event';
			readonly hostNodeId: string;
			readonly eventName: string;
			readonly symbolId?: string;
			readonly event: ResumeDomEvent;
			readonly element: ResumeDomElement;
	  }
	| {
			readonly phase: 'runtime';
			readonly graphNodeId?: string;
			readonly branchId?: string;
			readonly boundaryId?: string;
			readonly hostNodeId?: string;
			readonly eventName?: string;
			readonly symbolId?: string;
	  };
export type ResumeRuntimeErrorHook = (
	error: unknown,
	context: ResumeRuntimeErrorContext,
) => void | Promise<void>;
export type ResumeSharedPatchDispatcher = (patch: RuntimeGraphSharedPatch) => void | Promise<void>;
export type ResumeRuntimeInput = {
	readonly root: ResumeDomElement;
	readonly graph: RuntimeGraph;
	readonly state?: ProtocolStatePayload;
	readonly view: ResumeViewRecord;
	readonly loadSymbol: (symbolId: string) => ResumeSymbol | Promise<ResumeSymbol>;
	readonly renderBranchHtml?: (html: string) => ReadonlyArray<ResumeDomNode>;
	readonly createVisibilityObserver?: ResumeVisibilityObserverFactory;
	readonly createRemovalObserver?: ResumeRemovalObserverFactory;
	readonly applyDomJournal?: (
		entries: ReadonlyArray<import('@markless/runtime').DomJournalEntry>,
	) => void | Promise<void>;
	readonly dispatchSharedPatch?: ResumeSharedPatchDispatcher;
	readonly onError?: ResumeRuntimeErrorHook;
};
export type ResumeDispatchOptions = {
	readonly syncPolicyAlreadyApplied?: boolean;
	readonly ignoreUnmatched?: boolean;
};
// whenAsyncBoundariesSettled/holdPendingSettleCommits: D8 navigation
// transitions — a route swap holds the outgoing page until the destination's
// boundaries settle (or the deadline passes; pending then stays a minimum
// duration). Optional: event-only containers never carry async boundaries.
export type ResumeRuntime = {
	readonly start: () => Promise<void>;
	readonly dispatch: (event: ResumeDomEvent, options?: ResumeDispatchOptions) => Promise<void>;
	readonly activateBehaviors: (hostNodeId: string) => Promise<void>;
	readonly getElement: (hostNodeId: string) => ResumeDomElement | undefined;
	readonly getAsyncBoundary: (boundaryId: string) => ResumeAsyncBoundaryRecord | undefined;
	readonly getBranch: (branchId: string) => ResumeBranchRecord | undefined;
	readonly disposeHost: (hostNodeId: string) => void;
	readonly dispose: () => void;
	readonly whenAsyncBoundariesSettled?: () => Promise<void>;
	readonly holdPendingSettleCommits?: (minVisibleMs: number) => Promise<void> | void;
};
export type ElementHandleRegistry = {
	readonly get: (handleIdOrName: string) => ResumeDomElement | undefined;
	readonly register: (
		hostNodeId: string,
		handle: { readonly handleId: string; readonly name: string },
		element: ResumeDomElement,
	) => void;
	readonly deleteHost: (hostNodeId: string) => void;
};
export type ResumePreparedCore = {
	readonly elementsByHostId: Map<string, ResumeDomElement>;
	readonly elementHandles: ElementHandleRegistry;
	readonly asyncBoundariesById: Map<string, ResumeAsyncBoundaryRecord>;
};
