import type {
	ProtocolArmRecordSet,
	ProtocolEventActionKind,
	ProtocolStatePayload,
	ProtocolSyncPolicy,
	ProtocolSyncPolicyCondition,
	ProtocolViewPayload,
} from '@markless/serializer/protocol';
import { PROTOCOL_EVENT_ACTION_KIND } from '@markless/serializer/protocol';
import type { MarklessExecutionLogMode } from '../dev-log.ts';
import type { OverlayInstalledRoot, OverlayPrimedDismissalHost } from '../overlay-handoff.ts';

type InlineDebugControls = {
	record(
		element: Element,
		eventName: string,
		input: {
			readonly kind: 'inline-resumer';
			readonly source: 'ssr-inline';
			readonly hostNodeId?: string;
		},
	): void;
	activate(): void;
	delegated?(eventNames: readonly string[]): void;
};

declare const __MARKLESS_PRERENDER_DEBUG_BOOTSTRAP__:
	| ((root: Element, phase: 'ssr-inline', active: false) => InlineDebugControls)
	| undefined;

declare const __MARKLESS_INLINE_SYNC_POLICY__: boolean;
declare const __MARKLESS_INLINE_GRAPH_SYNC_POLICY__: boolean;
declare const __MARKLESS_INLINE_SHARED_GRAPH_POLICY__: boolean;
declare const __MARKLESS_INLINE_DEBUG__: boolean;
declare const __MARKLESS_INLINE_EXECUTION_LOG__: MarklessExecutionLogMode;
declare const __MARKLESS_INLINE_RESUME_MODULE_URL__: string | undefined;
declare const __MARKLESS_INLINE_DEBUG_BOOTSTRAP__:
	| ((root: Element, phase: 'ssr-inline', active: false) => InlineDebugControls)
	| undefined;
declare const __MARKLESS_INLINE_DEBUG_REGISTER__:
	| ((input: {
			readonly controls: InlineDebugControls | undefined;
			readonly elements: ReadonlyArray<Element>;
			readonly eventName: string;
			readonly view: InlineView;
	  }) => void)
	| undefined;

export type InlineResumerBuildOptions = {
	readonly debug: boolean;
	readonly debugBootstrapSource?: string;
	readonly debugRegistrationSource?: string;
	readonly executionLog: MarklessExecutionLogMode;
	readonly graphSyncPolicy: boolean;
	readonly resumeModuleUrl?: string;
	readonly sharedGraphPolicy: boolean;
	readonly syncPolicy: boolean;
};

/**
 * Per boundary, per bound symbol: the parent route that answers each of that
 * symbol's own legacy graph reads. The read is keyed `node|a.b` — flattened at
 * build time so the boot looks a slot up instead of matching one, because the
 * matcher would be load-path bytes on every settled page.
 */
export type PrerenderSettleBoundMap = Record<
	string,
	Record<string, Record<string, readonly [string, ReadonlyArray<string>]>>
>;

/**
 * The precompiled prerender boots a page can ship, each still carrying the
 * unresolved event-names token. `settle` is present only when the build also
 * produced a fill plan and a settle module for this page.
 */
export type PrerenderBootArtifact = {
	readonly prerender: string;
	readonly prerenderSelfWake: string;
	readonly settle?: {
		readonly moduleUrl: string;
		readonly boot: string;
		readonly bound: PrerenderSettleBoundMap;
	};
};

export type InlineResumerSourceVariants = {
	readonly debug: boolean;
	readonly executionLog: MarklessExecutionLogMode;
	readonly event: string;
	readonly syncPolicy: string;
	readonly graphSyncPolicyOwner: string;
	readonly graphSyncPolicyConsumer: string;
};

type InlineView = ProtocolViewPayload;
type InlineEventRecord = InlineView['events'][number];
/**
 * What the settle boot hands the wake path for one boundary it already filled:
 * the boundary id, and a reader over the SAME settled value the fill used. The
 * wake re-derives that boundary's arm records from it, so the runtime adopts
 * the DOM the filler produced instead of re-rendering it.
 */
export type MarklessSettledArmHandoff = {
	readonly boundaryId: string;
	readonly read: (graphNodeId: string, path?: ReadonlyArray<string>) => unknown;
};

type InlineRoot = HTMLElement &
	OverlayInstalledRoot &
	OverlayPrimedDismissalHost & {
		__asyncResumeRuntimeStarted?: boolean;
		__marklessDelegatedDispatch?: boolean;
		__marklessSettledArms?: Array<MarklessSettledArmHandoff>;
		__marklessEventOnlyGraph?: Map<string, unknown>;
		__marklessEventOnlyGraphInitialized?: boolean;
		// The control a crossing woke this page on. A resting pointer sends no
		// second crossing, so the runtime's own preload would otherwise miss it.
		__marklessPrimedHover?: Element;
	};
type InlineDispatchInput = {
	readonly root: InlineRoot;
	readonly event: Event | 0;
	readonly element?: Element | EventTarget | null;
	readonly eventRecord?: InlineEventRecord | null;
	readonly syncPolicyAlreadyApplied?: boolean;
};
type InlineResumeModule = {
	resumeContainerEvent(input: InlineDispatchInput): Promise<void> | void;
};
type InlineSyncPolicyRuntime = {
	decode?: (slot: unknown, records: ReadonlyMap<number, SerializedRecord>) => unknown;
	graph?: (root: InlineRoot) => Map<string, unknown>;
	read?: (root: InlineRoot, graphNodeId: string, path?: ReadonlyArray<string>) => unknown;
	matches?: (condition: ProtocolSyncPolicyCondition, event: Event, root: InlineRoot) => boolean;
	run?: (policy: ProtocolSyncPolicy, event: Event, root: InlineRoot) => void;
};
type SerializedRecord = {
	readonly id: number;
	readonly type: string;
	readonly fields?: ReadonlyArray<readonly [string, unknown]>;
	readonly items?: ReadonlyArray<unknown>;
	readonly entries?: ReadonlyArray<readonly [unknown, unknown]>;
	readonly values?: ReadonlyArray<unknown>;
	readonly value?: string;
	readonly source?: string;
	readonly flags?: string;
	readonly bytes?: ReadonlyArray<number>;
	readonly arrayType?: string;
	readonly buffer?: unknown;
	readonly byteOffset?: number;
	readonly byteLength?: number;
	readonly length?: number;
};

const _INLINE_EVENT_ACTIONS = {
	[PROTOCOL_EVENT_ACTION_KIND.event]: 'forward',
	[PROTOCOL_EVENT_ACTION_KIND.externalDelegate]: 'noop',
} as const satisfies Record<ProtocolEventActionKind, 'forward' | 'noop'>;

export function createInlineResumerSource(options: InlineResumerBuildOptions): string {
	if (options.debug && (!options.debugBootstrapSource || !options.debugRegistrationSource)) {
		throw new Error('MARKLESS_INLINE_RESUMER_DEBUG_SOURCE_REQUIRED');
	}
	const debugBootstrap = options.debug ? options.debugBootstrapSource : 'undefined';
	const debugRegistration = options.debug ? options.debugRegistrationSource : 'undefined';
	// Composed in, not runtime-gated: a `never` document must not carry the
	// logging text at all, which is what the prerender variant already does.
	const logging = options.executionLog !== 'never';
	return `{
const __MARKLESS_INLINE_SYNC_POLICY__=${JSON.stringify(options.syncPolicy)};
const __MARKLESS_INLINE_GRAPH_SYNC_POLICY__=${JSON.stringify(options.graphSyncPolicy)};
const __MARKLESS_INLINE_SHARED_GRAPH_POLICY__=${JSON.stringify(options.sharedGraphPolicy)};
const __MARKLESS_INLINE_DEBUG__=${JSON.stringify(options.debug)};
const __MARKLESS_INLINE_EXECUTION_LOG__=${JSON.stringify(options.executionLog)};
const __MARKLESS_INLINE_RESUME_MODULE_URL__=${JSON.stringify(options.resumeModuleUrl)};
const __MARKLESS_INLINE_DEBUG_BOOTSTRAP__=${debugBootstrap};
const __MARKLESS_INLINE_DEBUG_REGISTER__=${debugRegistration};
${logging ? `(${runGeneralInlineLogSummary.toString()})(${JSON.stringify(options.executionLog)});\n` : ''}(${runInlineResumer.toString()})((url) => import(/* @vite-ignore */ url));
}`;
}

export function createInlineResumerDebugRegistrationSource(): string {
	return `(${registerInlineResumerDebug.toString()})`;
}

export function createInlineResumerSelfWakeSource(resumeModuleUrl: string | undefined): string {
	return `;(${runInlineResumerSelfWake.toString()})(${JSON.stringify(resumeModuleUrl)});`;
}

/**
 * The Escape primer, appended only to a page whose served HTML carries an
 * `overlay` mark.
 *
 * Appended rather than composed into the resumer body for the same reason the
 * self-wake is: the body is serialized whole, so a flag inside it would put the
 * text on every page in the world to serve the few that elevate anything. A page
 * with no mark ships a byte-identical resumer.
 */
export function createInlineResumerOverlayPrimerSource(
	resumeModuleUrl: string | undefined,
): string {
	return `;(${runInlineResumerOverlayPrimer.toString()})(${JSON.stringify(resumeModuleUrl)},(url) => import(/* @vite-ignore */ url));`;
}

// The page's event names vary, so a precompiled boot cannot bake them in. The
// compiled source leaves this identifier unresolved and the emitter substitutes
// the page's names; the bundler's compile step fails closed if a minifier ever
// folded it away. Owned here because both producers of the boot source live in
// this module.
export const PRERENDER_INLINE_EVENT_NAMES_TOKEN = '__MARKLESS_PRERENDER_EVENT_NAMES__';

export function renderPrerenderInlineResumerSource(
	compiled: string,
	eventNames: ReadonlyArray<string>,
): string {
	return compiled.replace(PRERENDER_INLINE_EVENT_NAMES_TOKEN, JSON.stringify(eventNames));
}

// Prerendered CSR already carries its rendered DOM, while its resume records
// stay in demand-loaded chunks. Delegate only the compiler-known event names;
// the demanded resume module derives records and performs exact target matching.
export function createPrerenderInlineResumerSource(
	eventNames: ReadonlyArray<string>,
	resumeModuleUrl: string | undefined,
	options?: {
		readonly debug?: { readonly bootstrapSource: string };
		readonly executionLog?: MarklessExecutionLogMode;
	},
): string {
	const plain = `(${runPrerenderInlineResumer.toString()})(${JSON.stringify(eventNames)},${JSON.stringify(resumeModuleUrl)},u=>import(u));`;
	const logging = options?.executionLog !== undefined && options.executionLog !== 'never';
	if (!options?.debug && !logging) return plain;
	return `{
${options?.debug ? `const __MARKLESS_PRERENDER_DEBUG_BOOTSTRAP__=${options.debug.bootstrapSource};\n(${runPrerenderInlineResumerDebugSetup.toString()})(${JSON.stringify(eventNames)});` : ''}
${logging ? `(${runPrerenderInlineResumerLogSummary.toString()})(${JSON.stringify(options.executionLog)});` : ''}
${plain}
}`;
}

// The settle boot: emitted only for a prerendered page that ships a fill plan
// AND a settle module. It replaces the self-wake boot — nothing on this path
// imports the resume module, so the runtime stays unloaded until a gesture.
export function createPrerenderSettleInlineResumerSource(
	eventNames: ReadonlyArray<string>,
	resumeModuleUrl: string | undefined,
): string {
	return `(${runPrerenderSettleBoot.toString()})(${JSON.stringify(eventNames)},${JSON.stringify(resumeModuleUrl)},u=>import(u));`;
}

type SettlePlanDocument = {
	readonly boundaries: ReadonlyArray<{
		readonly id: string;
		readonly node: string;
		readonly key?: unknown;
		readonly version?: number;
	}>;
	readonly bound?: PrerenderSettleBoundMap;
	readonly initial?: Record<string, unknown>;
};

type SettleModule = {
	// The DOM filler, the boundary runners by graph node, and the derive symbols
	// by bound-symbol id. Data and import targets only: the module has no logic.
	readonly f: (input: unknown) => void;
	readonly r: Record<string, (input: { readonly key: unknown }) => Promise<unknown>>;
	readonly d: Record<string, (input: unknown) => unknown>;
};

function runPrerenderSettleBoot(
	eventNames: ReadonlyArray<string>,
	fallbackResumeModuleUrl: string | undefined,
	loadModule: (url: string) => Promise<InlineResumeModule & SettleModule>,
): void {
	const currentScript = document.currentScript as HTMLScriptElement | null;
	const root = currentScript?.closest<InlineRoot>('[data-async-container]');
	const resumeModuleUrl =
		currentScript?.getAttribute?.('data-markless-resume-module') ?? fallbackResumeModuleUrl;
	if (!root || !resumeModuleUrl) return;
	const settleModuleUrl = currentScript?.getAttribute?.('data-markless-settle-module');
	const planScript = root.querySelector('script[type="markless/fill-plan"]');
	const filled: Array<readonly [Node, Node]> = [];
	let replayed = false;
	// Resolves when this page's arms are filled (or the fallback has taken the
	// boundary). Gestures queue behind it, so the runtime a gesture boots always
	// sees a settled arm it can adopt.
	let ready: Promise<unknown> = Promise.resolve();
	// Safety net for a pre-boot gesture on a filled arm. The wake normally adopts
	// the filled arm and matches the event directly; if it cannot (the settle
	// kernel refuses that arm, so the runtime re-renders it instead), the event
	// would be dropped. Re-deliver it once, on the element that took the
	// target's place, so a click landing before the runtime is never lost.
	const replay = (target: Element) => {
		if (replayed) return;
		if (
			!filled.some(
				(range) =>
					!!(range[0].compareDocumentPosition(target) & 4) &&
					!!(range[1].compareDocumentPosition(target) & 2),
			)
		)
			return;
		replayed = true;
		const elements = root.getElementsByTagName('*');
		// HTMLCollection is array-like, not an Array; borrowing indexOf avoids a copy.
		const index = ([] as Element[]).indexOf.call(elements as unknown as Element[], target);
		const observer = new MutationObserver(() => {
			const next = elements[index];
			if (!next || next === target) return;
			observer.disconnect();
			(next as HTMLElement).click();
		});
		observer.observe(root, { childList: true, subtree: true });
	};
	// Same one-promise rule as the classic resumer's `forward`: reusing this
	// root's import promise is what keeps queued gestures arriving FIFO.
	let loaded: Promise<InlineResumeModule & SettleModule> | undefined;
	const resume = (
		input: InlineDispatchInput | { readonly root: InlineRoot; readonly event: 0 },
	) =>
		(loaded ||= loadModule(resumeModuleUrl)).then((module) =>
			module.resumeContainerEvent(input as never),
		);
	for (const eventName of eventNames) {
		root.addEventListener(
			eventName,
			(event) => {
				root.__marklessDelegatedDispatch = true;
				replay(event.target as Element);
				// Queued, not dropped: a gesture arriving before the arm settles
				// waits for the fill. Dispatching it first would boot a runtime whose
				// records still describe @pending — and whichever trigger group
				// covered the gesture would leave the boundary unowned.
				return ready.then(() =>
					resume({ root, event, element: event.target, eventRecord: null }),
				);
			},
			true,
		);
	}
	// Only the failure paths reach the runtime without a gesture: no plan, no
	// settle module, a rejected runner, or a filler that refused to place a hole.
	const wake = () => {
		if (root.__marklessDelegatedDispatch) return;
		root.__marklessDelegatedDispatch = true;
		resume({ root, event: 0 });
	};
	const plan = (
		planScript && settleModuleUrl ? JSON.parse(planScript.textContent || 'null') : null
	) as SettlePlanDocument | null;
	if (!plan) {
		wake();
		return;
	}
	ready = loadModule(settleModuleUrl!)
		.then(async (settle) => {
			const comments: Record<string, Node> = {};
			const walker = document.createTreeWalker(root, 128);
			for (let node = walker.nextNode(); node; node = walker.nextNode())
				comments[(node as Comment).data] = node;
			for (const boundary of plan.boundaries) {
				const value = await settle.r[boundary.node]!({ key: boundary.key ?? null });
				// A gesture already landed: its own state change (a weight bump, say)
				// is newer than anything this fill could place, so hand the boundary
				// to the runtime and let it render the arm from the live graph. The
				// event-less wake is what owns a boundary — the trigger group the
				// gesture matched does not.
				if (root.__marklessDelegatedDispatch) return resume({ root, event: 0 });
				const anchors = [
					comments[`markless:async:${boundary.id}`]!,
					comments[`/markless:async:${boundary.id}`]!,
				] as const;
				const read = (node: string, path: ReadonlyArray<string>) => {
					let current: unknown = node === boundary.node ? value : plan.initial![node];
					for (const key of path)
						current =
							current == null ? undefined : (current as Record<string, unknown>)[key];
					return current;
				};
				const template = (kind: string) =>
					root.querySelector(`template[m\\:${kind}="${boundary.id}"]`);
				settle.f({
					plan: boundary,
					templates: {
						arm: template('arm'),
						row: template('row'),
						empty: template('empty'),
					},
					value,
					anchors,
					read,
					// The plan names a compiled derive symbol; the descriptor answers
					// that symbol's own legacy graph reads with this page's routes.
					// Nothing here evaluates an expression.
					derive: (symbolId: string) => {
						const slots = plan.bound![boundary.id]![symbolId]!;
						return settle.d[symbolId]!({
							graph: {
								read: (node: string, path: ReadonlyArray<string> = []) => {
									const slot = slots[`${node}|${path.join('.')}`];
									if (!slot) throw new Error('MARKLESS_SETTLE_SLOT_UNKNOWN');
									return read(slot[0], slot[1]);
								},
							},
						});
					},
				});
				filled.push(anchors);
				// The wake reads the boundary's own node with an empty path to get a
				// SNAPSHOT (that is the graph's shape for an async computed); every
				// other read is a plain value walk.
				(root.__marklessSettledArms ??= []).push({
					boundaryId: boundary.id,
					read: (node, path) =>
						node === boundary.node && !path?.length
							? {
									status: 'fulfilled',
									version: boundary.version ?? 1,
									key: boundary.key ?? null,
									value,
								}
							: read(node, path ?? []),
				});
			}
		})
		// The fallback owns the boundary from here: nothing else on this page
		// will settle it, so this wake runs even after a gesture set the flag.
		.catch(() => resume({ root, event: 0 }));
}

// Log builds only, composed into both inline boots: the empty-delta page
// executes nothing at load, so the truthful summary and byte mirrors are
// written inline. Never mode composes it out, so it costs a `never` page zero.
type MarklessInlineLedger = {
	unit: string;
	load: { app: number; framework: number; instrument: number; inline: number; modules: string[] };
	total: { app: number; framework: number; instrument: number; inline: number };
	turns: Array<{
		kind: string;
		label?: string;
		delta: { app: number; framework: number; instrument: number };
		modules: string[];
	}>;
	incomplete: null | { reason: string; ids: string[] };
	loadClosed?: boolean;
};

// These bodies are serialized with Function.prototype.toString and inlined into
// the document, so every one of them has to carry its own ledger arithmetic: a
// module-scope helper would not survive the trip.
function runPrerenderInlineResumerLogSummary(mode: 'always' | 'auto'): void {
	const shouldLog = (() => {
		if (mode === 'always') return true;
		const currentLocation = location;
		if (
			/^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::|$)/.test(currentLocation.origin) ||
			new URLSearchParams(currentLocation.search).has('markless-log')
		)
			return true;
		try {
			return localStorage.getItem('marklessLog') === '1';
		} catch {
			return false;
		}
	})();
	if (!shouldLog) return;
	const globalScope = globalThis as typeof globalThis & {
		__mxLog?: Set<string>;
		__marklessExecutionLedger?: MarklessInlineLedger;
	};
	// The one figure an inline script can back without a size map: its own
	// shipped bytes — which for an SSR page is 100% of the JS executed at load.
	const ledger = (globalScope.__marklessExecutionLedger ||= {
		unit: 'chunk-raw-bytes',
		load: { app: 0, framework: 0, instrument: 0, inline: 0, modules: [] },
		total: { app: 0, framework: 0, instrument: 0, inline: 0 },
		turns: [],
		incomplete: null,
	});
	const ownBytes = (document.currentScript as HTMLScriptElement | null)?.textContent?.length ?? 0;
	ledger.total.inline += ownBytes;
	if (!ledger.loadClosed) ledger.load.inline += ownBytes;
	// Load ends at the first user gesture, and an inline document script is the
	// only observer early enough to see it. A module-scope helper cannot be used:
	// these bodies are serialized with toString and would lose the reference.
	for (const type of ['pointerdown', 'touchstart', 'keydown'])
		addEventListener(type, (event) => { if (event.isTrusted) ledger.loadClosed = true; }, { capture: true, passive: true });
	ledger.turns.push({
		kind: 'resume',
		delta: { app: 0, framework: 0, instrument: 0 },
		modules: [],
	});
	const executed = [...(globalScope.__mxLog ||= new Set())];
	const preloaded = document.querySelectorAll('link[rel=modulepreload]').length;
	const loadBytes = ledger.load.app + ledger.load.framework + ledger.load.inline;
	const totalBytes = ledger.total.app + ledger.total.framework + ledger.total.inline;
	// Zero executed modules is the honest whole story for a resumed SSR page, so
	// that arm keeps its exact sentence and its exact zero mirrors; anything else
	// has to come from the ledger, which is the only thing that can back it.
	const summary =
		executed.length === 0
			? `markless: resumed — 0.0 KB app executed, ${preloaded} modules preloaded (0 app executed) · 0.0 KB instrument`
			: `markless: ${(loadBytes / 1024).toFixed(1)} KB executed at load · total ${(totalBytes / 1024).toFixed(1)} KB · ${executed.length} modules pending sizes`;
	console.log(summary);
	const documentElement = document.documentElement;
	if (documentElement) {
		documentElement.setAttribute('data-markless-log-summary', summary);
		documentElement.setAttribute('data-markless-log-inline-bytes', String(ledger.total.inline));
		documentElement.setAttribute('data-markless-log-load-bytes', String(loadBytes));
		if (executed.length === 0) {
			documentElement.setAttribute('data-markless-log-app-bytes', '0');
			documentElement.setAttribute('data-markless-log-instrument-bytes', '0');
		} else {
			documentElement.removeAttribute('data-markless-log-app-bytes');
		}
	}
}

// The general resumer's copy of the same summary. It was inline in
// runInlineResumer and gated on a baked-in const, which shipped its text into
// `never` documents; composed in here, a consumer page carries none of it.
function runGeneralInlineLogSummary(mode: 'always' | 'auto'): void {
	const shouldLog = (() => {
		if (mode === 'always') return true;
		const currentLocation = location;
		if (
			/^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::|$)/.test(currentLocation.origin) ||
			new URLSearchParams(currentLocation.search).has('markless-log')
		)
			return true;
		try {
			return localStorage.getItem('marklessLog') === '1';
		} catch {
			return false;
		}
	})();
	if (!shouldLog) return;
	const currentDocument = document;
	const currentScript = currentDocument.currentScript as HTMLScriptElement | null;
	const globalScope = globalThis as typeof globalThis & {
		__mxLog?: Set<string>;
		__marklessExecutionLedger?: MarklessInlineLedger;
	};
	const executionLog = (globalScope.__mxLog ||= new Set());
	// Same ledger, same one figure this script can back: its own bytes.
	const ledger = (globalScope.__marklessExecutionLedger ||= {
		unit: 'chunk-raw-bytes',
		load: { app: 0, framework: 0, instrument: 0, inline: 0, modules: [] },
		total: { app: 0, framework: 0, instrument: 0, inline: 0 },
		turns: [],
		incomplete: null,
	});
	const ownBytes = currentScript?.textContent?.length ?? 0;
	ledger.total.inline += ownBytes;
	if (!ledger.loadClosed) ledger.load.inline += ownBytes;
	// Load ends at the first user gesture, and an inline document script is the
	// only observer early enough to see it. A module-scope helper cannot be used:
	// these bodies are serialized with toString and would lose the reference.
	for (const type of ['pointerdown', 'touchstart', 'keydown'])
		addEventListener(type, (event) => { if (event.isTrusted) ledger.loadClosed = true; }, { capture: true, passive: true });
	ledger.turns.push({
		kind: 'resume',
		delta: { app: 0, framework: 0, instrument: 0 },
		modules: [],
	});
	const executed = [...executionLog];
	const preloaded = currentDocument.querySelectorAll('link[rel=modulepreload]').length;
	const loadBytes = ledger.load.app + ledger.load.framework + ledger.load.inline;
	const totalBytes = ledger.total.app + ledger.total.framework + ledger.total.inline;
	const summary =
		executed.length === 0
			? `markless: resumed — 0.0 KB app executed, ${preloaded} modules preloaded (0 app executed) · 0.0 KB instrument`
			: `markless: ${(loadBytes / 1024).toFixed(1)} KB executed at load · total ${(totalBytes / 1024).toFixed(1)} KB · ${executed.length} modules pending sizes`;
	console.log(summary);
	const documentElement = currentDocument.documentElement;
	if (documentElement) {
		documentElement.setAttribute('data-markless-log-summary', summary);
		documentElement.setAttribute('data-markless-log-inline-bytes', String(ledger.total.inline));
		documentElement.setAttribute('data-markless-log-load-bytes', String(loadBytes));
		if (executed.length === 0) {
			documentElement.setAttribute('data-markless-log-app-bytes', '0');
			documentElement.setAttribute('data-markless-log-instrument-bytes', '0');
		} else {
			documentElement.removeAttribute('data-markless-log-app-bytes');
			documentElement.removeAttribute('data-markless-log-instrument-bytes');
		}
	}
}

// Flagged builds only: publish the debug channel and register the delegated
// event names so explainInteraction answers before per-element records exist.
function runPrerenderInlineResumerDebugSetup(eventNames: ReadonlyArray<string>): void {
	const currentScript = document.currentScript as HTMLScriptElement | null;
	const root = currentScript?.closest('[data-async-container]');
	if (!root) return;
	try {
		const controls = __MARKLESS_PRERENDER_DEBUG_BOOTSTRAP__?.(root, 'ssr-inline', false);
		controls?.delegated?.(eventNames);
		controls?.activate();
	} catch {}
}

function runPrerenderInlineResumer(
	eventNames: ReadonlyArray<string>,
	fallbackResumeModuleUrl: string | undefined,
	loadModule: (url: string) => Promise<InlineResumeModule>,
): void {
	const currentScript = document.currentScript as HTMLScriptElement | null;
	const root = currentScript?.closest<InlineRoot>('[data-async-container]');
	const resumeModuleUrl =
		currentScript?.getAttribute?.('data-markless-resume-module') ?? fallbackResumeModuleUrl;
	if (!root || !resumeModuleUrl) return;
	// One import promise for this root, not one per event: same FIFO rule the
	// classic resumer's `forward` follows.
	let loaded: Promise<InlineResumeModule> | undefined;
	for (const eventName of eventNames) {
		root.addEventListener(
			eventName,
			(event) => {
				root.__marklessDelegatedDispatch = true;
				return (loaded ||= loadModule(resumeModuleUrl)).then((module) =>
					module.resumeContainerEvent({
						root,
						event,
						element: event.target,
						eventRecord: null,
					}),
				);
			},
			true,
		);
	}
}

// Serialized only into documents whose payload has an unsettled async runner.
// Keeping this outside runInlineResumer leaves event-only documents on the
// smaller interaction-triggered bootstrap.
function runInlineResumerSelfWake(fallbackResumeModuleUrl: string | undefined): void {
	const currentScript = document.currentScript as HTMLScriptElement | null;
	const root = currentScript?.closest<InlineRoot>('[data-async-container]');
	const resumeModuleUrl =
		currentScript?.getAttribute?.('data-markless-resume-module') ?? fallbackResumeModuleUrl;
	if (!root || !resumeModuleUrl) return;
	// A streamed arm schedules its reveal while the response is still parsing.
	// Let that earlier frame commit before event-less resume adopts the DOM.
	const wake = () =>
		requestAnimationFrame(() => {
			queueMicrotask(async () => {
				if (!root.__asyncResumeRuntimeStarted) {
					root.__marklessDelegatedDispatch = true;
					const module = (await import(
						/* @vite-ignore */ resumeModuleUrl
					)) as InlineResumeModule;
					await module.resumeContainerEvent({ root, event: 0 });
				}
			});
		});
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', wake, { once: true });
	} else {
		wake();
	}
}

/**
 * One window-level listen, from first paint, on a page that elevates something.
 *
 * Two facts make it necessary. A page served with an open overlay is on the
 * stack the moment the behaviour installs, but nothing installs until the
 * runtime wakes; and Escape is the one gesture with no route into the page -
 * every other one reaches an authored handler through the container's own
 * listener, while a dismissal is reported by a document listener that does not
 * exist yet. So the first Escape on such a page would be spent waking and
 * dismiss nothing. This listens above the container, leaves the reason where the
 * behaviour's installer takes it, and lets the wake finish the job.
 *
 * It stays armed until that installer runs, because a wake that has STARTED is
 * not a behaviour that is LISTENING - the installer is an import away, and an
 * earlier gesture (a focus arriving on a control the page has a record for is
 * enough) starts the wake without covering the keyboard. An Escape landing in
 * that window is silently lost unless this still takes it.
 *
 * Deliberately not the waker of first resort. The container's own capture
 * listener runs after this one and wakes the runtime for any event the page has
 * a record for; waking here as well would start a second runtime for one
 * gesture. Deciding a task later is what tells the two apart.
 */
function runInlineResumerOverlayPrimer(
	fallbackResumeModuleUrl: string | undefined,
	loadModule: (url: string) => Promise<InlineResumeModule>,
): void {
	const currentScript = document.currentScript as HTMLScriptElement | null;
	const root = currentScript?.closest<InlineRoot>('[data-async-container]');
	const resumeModuleUrl =
		currentScript?.getAttribute?.('data-markless-resume-module') ?? fallbackResumeModuleUrl;
	if (!root || !resumeModuleUrl) return;
	const prime = (event: Event) => {
		// Installed is the only state that means something else owns the keyboard;
		// a reason left behind after that would dismiss something twice.
		if (root.__marklessOverlayInstalled) {
			removeEventListener('keydown', prime, true);
			removeEventListener('pointerdown', prime, true);
			return;
		}
		if ((event as KeyboardEvent).key === 'Escape')
			root.__marklessOverlayPrimedDismissal = 'escape';
		if (root.__marklessDelegatedDispatch) return;
		setTimeout(() => {
			if (root.__marklessDelegatedDispatch) return;
			root.__marklessDelegatedDispatch = true;
			// A wake, not a dispatch: `0` is the same no-event shape the self-wake
			// sends. Forwarding the real event instead would ask the runtime to
			// match a record for a key no page has one for, and being unmatched is
			// a reported defect, correctly.
			loadModule(resumeModuleUrl).then((module) =>
				module.resumeContainerEvent({ root, event: 0 }),
			);
		});
	};
	addEventListener('keydown', prime, true);
	addEventListener('pointerdown', prime, true);
}

function registerInlineResumerDebug(input: {
	readonly controls: InlineDebugControls | undefined;
	readonly elements: ReadonlyArray<Element>;
	readonly eventName: string;
	readonly view: InlineView;
}): void {
	for (const candidate of input.view.events) {
		if (candidate.eventName !== input.eventName || candidate.eventName === 'visible') continue;
		const locator = input.view.locators.find(
			(item) => item.hostNodeId === candidate.hostNodeId,
		);
		const element = locator ? input.elements[locator.index] : undefined;
		if (element && input.controls) {
			try {
				input.controls.record(element, input.eventName, {
					kind: 'inline-resumer',
					source: 'ssr-inline',
					hostNodeId: candidate.hostNodeId,
				});
			} catch {}
		}
	}
}

// This function is serialized as the classic inline bootstrap. Keep every
// runtime dependency inside its body; type-only declarations above disappear
// before serialization and Rolldown/OXC owns production identifier mangling.
function runInlineResumer(loadModule: (url: string) => Promise<InlineResumeModule>): void {
	const currentDocument = document;
	const currentScript = currentDocument.currentScript as HTMLScriptElement | null;
	const root = currentScript?.closest<InlineRoot>('[data-async-container]');
	const resumeModuleUrl =
		currentScript?.getAttribute?.('data-markless-resume-module') ??
		__MARKLESS_INLINE_RESUME_MODULE_URL__;
	if (!root || !resumeModuleUrl) return;
	// One import promise per root, reused: `.then` callbacks on the SAME promise
	// run in registration order, so events reach the dispatch queue in the order
	// they fired. A fresh import() per event resolves in no guaranteed order, and
	// the queue then faithfully serializes the scrambled arrivals.
	let loaded: Promise<InlineResumeModule> | undefined;
	const forward = (input: Omit<InlineDispatchInput, 'root'>) => {
		root.__marklessDelegatedDispatch = true;
		return (loaded ||= loadModule(resumeModuleUrl)).then((module) =>
			module.resumeContainerEvent({ root, ...input }),
		);
	};

	const viewScript = root.querySelector<HTMLScriptElement>('script[type="markless/view"]');
	if (!viewScript) return;
	const view = JSON.parse(viewScript.textContent || 'null') as InlineView;
	const walker = currentDocument.createTreeWalker(root, 1);
	const elements: Element[] = [root];
	let nextElement: Node | null;
	while ((nextElement = walker.nextNode())) elements.push(nextElement as Element);
	const hostIds = new Map(
		view.locators.flatMap((locator) => {
			const element = elements[locator.index];
			return element ? ([[element, locator.hostNodeId]] as const) : [];
		}),
	);
	const events = new Map<string, InlineEventRecord>();
	for (const event of view.events) {
		if (event.eventName !== 'visible') {
			events.set(`${event.hostNodeId}\n${event.eventName}`, event);
		}
	}

	const globalScope = globalThis as typeof globalThis & {
		__marklessInlineSyncPolicy?: InlineSyncPolicyRuntime;
		__mxLog?: Set<string>;
	};
	if (__MARKLESS_INLINE_GRAPH_SYNC_POLICY__ && __MARKLESS_INLINE_SHARED_GRAPH_POLICY__) {
		const shared = (globalScope.__marklessInlineSyncPolicy ||= {});
		shared.decode ||= (slot, records) => {
			if (slot === null || typeof slot !== 'object') return slot;
			if ('$ref' in slot) {
				const record = records.get((slot as { readonly $ref: number }).$ref);
				if (!record) return undefined;
				if (record.type === 'object') {
					const value: Record<string, unknown> = {};
					for (const [key, field] of record.fields ?? []) {
						value[key] = shared.decode!(field, records);
					}
					return value;
				}
				if (record.type === 'array')
					return (record.items ?? []).map((value) => shared.decode!(value, records));
				if (record.type === 'map')
					return new Map(
						(record.entries ?? []).map(([key, value]) => [
							shared.decode!(key, records),
							shared.decode!(value, records),
						]),
					);
				if (record.type === 'set')
					return new Set(
						(record.values ?? []).map((value) => shared.decode!(value, records)),
					);
				if (record.type === 'date') return new Date(record.value!);
				if (record.type === 'regexp') return new RegExp(record.source!, record.flags);
				if (record.type === 'url') return new URL(record.value!);
				if (record.type === 'array-buffer')
					return new Uint8Array(record.bytes ?? []).buffer;
				if (record.type === 'typed-array') {
					const TypedArray = (
						globalThis as typeof globalThis &
							Record<
								string,
								new (buffer: ArrayBuffer, offset: number, length: number) => unknown
							>
					)[record.arrayType!];
					const buffer = shared.decode!(record.buffer, records);
					return TypedArray && buffer instanceof ArrayBuffer
						? new TypedArray(buffer, record.byteOffset!, record.length!)
						: undefined;
				}
				if (record.type === 'data-view') {
					const buffer = shared.decode!(record.buffer, records);
					return buffer instanceof ArrayBuffer
						? new DataView(buffer, record.byteOffset, record.byteLength)
						: undefined;
				}
				return undefined;
			}
			const tagged = slot as { readonly $type?: string; readonly value?: string };
			if (tagged.$type === 'undefined') return undefined;
			if (tagged.$type === 'bigint') return BigInt(tagged.value!);
			if (tagged.$type === 'number') return Number(tagged.value!);
			if (tagged.$type === 'date') return new Date(tagged.value!);
			if (tagged.$type === 'regexp') {
				const regexp = slot as { readonly source: string; readonly flags?: string };
				return new RegExp(regexp.source, regexp.flags);
			}
			if (tagged.$type === 'url') return new URL(tagged.value!);
			return (slot as { readonly value?: unknown }).value;
		};
		shared.graph ||= (container) => {
			const graph = (container.__marklessEventOnlyGraph ||= new Map());
			const stateScript = container.querySelector<HTMLScriptElement>(
				'script[type="markless/state"]',
			);
			if (stateScript && !container.__marklessEventOnlyGraphInitialized) {
				const state = JSON.parse(stateScript.textContent || 'null') as ProtocolStatePayload;
				for (const cell of state.cells ?? []) {
					if (!cell.value || graph.has(cell.graphNodeId)) continue;
					const payload = cell.value as {
						readonly root: unknown;
						readonly records?: ReadonlyArray<SerializedRecord>;
					};
					const records = new Map(
						(payload.records ?? []).map((record) => [record.id, record]),
					);
					graph.set(cell.graphNodeId, shared.decode!(payload.root, records));
				}
				container.__marklessEventOnlyGraphInitialized = true;
			}
			return graph;
		};
		shared.read ||= (container, graphNodeId, path) => {
			let value = shared.graph!(container).get(graphNodeId);
			for (const key of path ?? []) {
				value = value == null ? undefined : (value as Record<string, unknown>)[key];
			}
			return value;
		};
		shared.matches ||= (condition, event, container) => {
			if (condition.type === 'and')
				return condition.conditions.every((item) =>
					shared.matches!(item, event, container),
				);
			if (condition.type === 'or')
				return condition.conditions.some((item) => shared.matches!(item, event, container));
			if (condition.type === 'not')
				return !shared.matches!(condition.condition, event, container);
			if (condition.type === 'graph-truthy')
				return !!shared.read!(container, condition.graphNodeId, condition.path);
			if (condition.type === 'constant-truthy') return !!condition.value;
			if (condition.type === 'event-equals')
				return (
					(event as unknown as Record<string, unknown>)[condition.field] ===
					condition.value
				);
			return false;
		};
		shared.run ||= (policy, event, container) => {
			const branches = 'branches' in policy ? policy.branches : [policy];
			for (const branch of branches) {
				if (!shared.matches!(branch.when, event, container)) continue;
				for (const action of branch.actions) {
					if (action === 'preventDefault') event.preventDefault?.();
					if (action === 'stopPropagation') event.stopPropagation?.();
				}
			}
		};
	}

	let runSyncPolicy: ((policy: ProtocolSyncPolicy, event: Event) => void) | undefined;
	if (__MARKLESS_INLINE_SYNC_POLICY__) {
		const matchesPolicyCondition = (
			condition: ProtocolSyncPolicyCondition,
			event: Event,
		): boolean => {
			if (condition.type === 'and')
				return condition.conditions.every((item) => matchesPolicyCondition(item, event));
			if (condition.type === 'or')
				return condition.conditions.some((item) => matchesPolicyCondition(item, event));
			if (condition.type === 'not')
				return !matchesPolicyCondition(condition.condition, event);
			if (condition.type === 'graph-truthy') {
				return __MARKLESS_INLINE_GRAPH_SYNC_POLICY__
					? !!globalScope.__marklessInlineSyncPolicy?.read?.(
							root,
							condition.graphNodeId,
							condition.path,
						)
					: false;
			}
			if (condition.type === 'constant-truthy') return !!condition.value;
			if (condition.type === 'event-equals')
				return (
					(event as unknown as Record<string, unknown>)[condition.field] ===
					condition.value
				);
			return false;
		};
		runSyncPolicy = (policy, event) => {
			if (__MARKLESS_INLINE_GRAPH_SYNC_POLICY__) {
				globalScope.__marklessInlineSyncPolicy!.run!(policy, event, root);
				return;
			}
			const branches = 'branches' in policy ? policy.branches : [policy];
			for (const branch of branches) {
				if (!matchesPolicyCondition(branch.when, event)) continue;
				for (const action of branch.actions) {
					if (action === 'preventDefault') event.preventDefault?.();
					if (action === 'stopPropagation') event.stopPropagation?.();
				}
			}
		};
	}

	let debugControls: InlineDebugControls | undefined;
	if (__MARKLESS_INLINE_DEBUG__) {
		try {
			debugControls = __MARKLESS_INLINE_DEBUG_BOOTSTRAP__?.(root, 'ssr-inline', false);
		} catch {}
	}

	// Array.isArray cannot narrow the readonly per-arm plan out of the union.
	const armRecordSets = view.asyncBoundaries.flatMap((boundary) => {
		const armRecords = boundary.armRecords as ProtocolArmRecordSet | undefined;
		return armRecords && !Array.isArray(armRecords) ? [armRecords] : [];
	});
	const branches = view.branches ?? [];
	const keyedRepeats = [
		...(view.keyedRepeats ?? []),
		...armRecordSets.flatMap((armRecords) => armRecords.keyedRepeats ?? []),
	];
	const nestedEventNames = new Set([
		...keyedRepeats.flatMap((repeat) => repeat.rowEvents.map((event) => event.eventName)),
		// An escalating branch serves one arm record set instead of a per-arm plan,
		// and a flip brings in elements no payload record names.
		...branches.flatMap((branch) =>
			[...(branch.armRecords ?? []), ...(branch.servedArmRecords ? [branch.servedArmRecords] : [])]
				.flatMap((arm) => arm.events.map((event) => event.eventName)),
		),
		...armRecordSets.flatMap((arm) => (arm.events ?? []).map((event) => event.eventName)),
	]);
	// A row that IS a component owns no element of the row chunk, so its gestures
	// ride the child's own records and `rowEvents` is empty by construction: the
	// unknown-element hatch below has to open on the record that says the list can
	// mint such a row, or a row born after boot is never forwarded at all.
	// An escalating branch replaces its arm from a fresh render, so a flip brings
	// in elements this payload names no record for: same hatch, same reason.
	const mintsComponentRows =
		keyedRepeats.some((repeat) => repeat.rowComponent !== undefined) ||
		branches.some((branch) => branch.escalates === true);
	const eventNames = new Set([
		...view.events.map((event) => event.eventName),
		...nestedEventNames,
	]);
	// A key event only reaches an element that already holds focus, and a pointer
	// crosses a control before pressing it (Safari focuses no button on click), so
	// focus and hover are what precede a first gesture. A wake, not a dispatch: the
	// real event arrives through the capture listener below, queued behind this
	// same import promise. Names are restated because this body ships by toString();
	// pointerenter is unusable here because it does not bubble.
	const pressPreloadEventNames = ['click', 'pointerdown', 'pointerup'];
	const focusWakeEventNames = [
		'keydown',
		'keyup',
		'keypress',
		'beforeinput',
		'input',
		...pressPreloadEventNames,
	];
	// Same hatch the dispatch listener opens on: a row minted after boot owns no
	// element this payload names a record for.
	const wakeOnUnknownElement =
		mintsComponentRows ||
		focusWakeEventNames.some((eventName) => nestedEventNames.has(eventName));
	const primeEventNames = ['focusin', 'pointerover'].filter((_name, hover) =>
		(hover ? pressPreloadEventNames : focusWakeEventNames).some((eventName) =>
			eventNames.has(eventName),
		),
	);
	if (primeEventNames.length > 0) {
		const prime = (event: Event) => {
			if (root.__marklessDelegatedDispatch) return;
			const hover = event.type === 'pointerover';
			let primed: Element | undefined;
			for (
				let element = event.target as Element | null;
				element && !primed;
				element = element.parentElement
			) {
				const hostNodeId = hostIds.get(element);
				const editable =
					(element as HTMLElement).isContentEditable === true ||
					element.tagName === 'INPUT' ||
					element.tagName === 'TEXTAREA' ||
					element.tagName === 'SELECT';
				if (
					hostNodeId &&
					(hover ? pressPreloadEventNames : focusWakeEventNames).some(
						(eventName) =>
							(editable ||
								(eventName !== 'beforeinput' && eventName !== 'input')) &&
							events.has(`${hostNodeId}\n${eventName}`),
					)
				)
					primed = element;
				if (element === root) break;
			}
			if (!primed && !hover && wakeOnUnknownElement) primed = root;
			if (!primed) return;
			// A resting pointer sends no second crossing, so the control the wake was
			// spent on is left where the runtime's own preload can read it.
			if (hover) root.__marklessPrimedHover = primed;
			for (const primeEventName of primeEventNames)
				root.removeEventListener(primeEventName, prime, true);
			forward({ event: 0 });
		};
		for (const primeEventName of primeEventNames)
			root.addEventListener(primeEventName, prime, true);
	}
	for (const eventName of eventNames) {
		if (eventName === 'visible') continue;
		root.addEventListener(
			eventName,
			(event) => {
				for (
					let element = event.target as Element | null;
					element;
					element = element.parentElement
				) {
					const hostNodeId = hostIds.get(element);
					const eventRecord = hostNodeId
						? events.get(`${hostNodeId}\n${event.type}`)
						: undefined;
					if (eventRecord) {
						if (eventRecord.action) return;
						let syncPolicyAlreadyApplied = false;
						if (__MARKLESS_INLINE_SYNC_POLICY__ && eventRecord.syncPolicy) {
							runSyncPolicy!(eventRecord.syncPolicy, event);
							syncPolicyAlreadyApplied = true;
						}
						const input: Omit<InlineDispatchInput, 'root'> = {
							event,
							element,
							eventRecord,
						};
						if (__MARKLESS_INLINE_SYNC_POLICY__) {
							(
								input as { syncPolicyAlreadyApplied?: boolean }
							).syncPolicyAlreadyApplied = syncPolicyAlreadyApplied;
						}
						return forward(input);
					}
					if (element === root) break;
				}
				if (mintsComponentRows || nestedEventNames.has(event.type)) {
					return forward({ event, element: event.target, eventRecord: null });
				}
				if (__MARKLESS_INLINE_EXECUTION_LOG__ !== 'never' && globalScope.__mxLog) {
					return forward({ event, element: event.target, eventRecord: null });
				}
			},
			true,
		);
		if (__MARKLESS_INLINE_DEBUG__) {
			__MARKLESS_INLINE_DEBUG_REGISTER__?.({
				controls: debugControls,
				elements,
				eventName,
				view,
			});
		}
	}
	if (__MARKLESS_INLINE_DEBUG__) {
		try {
			debugControls?.activate();
		} catch {}
	}
}
