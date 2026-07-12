declare const __MARKLESS_DEBUG_ENABLED__: boolean;

export type MarklessDebugContainerId = string;
export type MarklessDebugRootKey = string;
export type MarklessDebugElementKey = string;
export type MarklessDebugContainerPhase = 'ssr-inline' | 'ssr-lean' | 'ssr-resume' | 'csr';
export type MarklessDebugContainerLifecycle = 'registered' | 'active' | 'disposing' | 'disposed';

export interface MarklessDebugRootSnapshot {
	readonly key: MarklessDebugRootKey;
	readonly connected: boolean;
}
export type MarklessDebugBoundaryStatus = 'pending' | 'fulfilled' | 'rejected' | 'missing';
export interface MarklessDebugBoundarySnapshot {
	readonly boundaryId: string;
	readonly readIndex: number;
	readonly graphNodeId: string;
	readonly status: MarklessDebugBoundaryStatus;
	readonly runVersion: number | null;
	readonly pendingSince: number | null;
	readonly hasSettledContent: boolean;
	readonly missingReason?: 'graph-read-missing' | 'snapshot-invalid';
}
export interface MarklessDebugContainerSnapshot {
	readonly id: MarklessDebugContainerId;
	readonly phase: MarklessDebugContainerPhase;
	readonly lifecycle: MarklessDebugContainerLifecycle;
	readonly root: MarklessDebugRootSnapshot;
	readonly boundaries: readonly MarklessDebugBoundarySnapshot[];
}
interface MarklessDebugInteractionBase {
	readonly containerId: MarklessDebugContainerId;
	readonly elementKey: MarklessDebugElementKey;
	readonly eventName: string;
}
export interface MarklessDebugInlineResumerInteraction extends MarklessDebugInteractionBase {
	readonly kind: 'inline-resumer';
	readonly source: 'ssr-inline' | 'streamed-arm';
	readonly hostNodeId?: string;
}
export interface MarklessDebugResumeRecordInteraction extends MarklessDebugInteractionBase {
	readonly kind: 'resume-record';
	readonly hostNodeId: string;
	readonly symbolIds: readonly string[];
}
export interface MarklessDebugRowRecordInteraction extends MarklessDebugInteractionBase {
	readonly kind: 'row-record';
	readonly repeatId: string;
	readonly symbolIds: readonly string[];
}
export interface MarklessDebugDirectCsrInteraction extends MarklessDebugInteractionBase {
	readonly kind: 'direct-csr';
	readonly source: 'static-event' | 'callback-prop';
}
export interface MarklessDebugRouterDelegationInteraction extends MarklessDebugInteractionBase {
	readonly kind: 'router-delegation';
	readonly source: 'ssr-link-bridge' | 'spa-click-listener' | 'navigation-event';
}
export interface MarklessDebugNoInteraction {
	readonly kind: 'none';
	readonly eventName: string;
	readonly reason:
		| 'outside-known-container'
		| 'container-disposed'
		| 'element-disconnected'
		| 'not-registered';
	readonly containerId?: MarklessDebugContainerId;
	readonly elementKey?: MarklessDebugElementKey;
}
export type MarklessDebugInteractionExplanation =
	| MarklessDebugInlineResumerInteraction
	| MarklessDebugResumeRecordInteraction
	| MarklessDebugRowRecordInteraction
	| MarklessDebugDirectCsrInteraction
	| MarklessDebugRouterDelegationInteraction
	| MarklessDebugNoInteraction;
export type MarklessDebugJson =
	| null
	| boolean
	| number
	| string
	| readonly MarklessDebugJson[]
	| { readonly [key: string]: MarklessDebugJson };
export interface MarklessDebugViolation {
	readonly sequence: number;
	readonly code: string;
	readonly message: string;
	readonly timestamp: number;
	readonly containerId?: MarklessDebugContainerId;
	readonly phase?: MarklessDebugContainerPhase;
	readonly elementKey?: MarklessDebugElementKey;
	readonly eventName?: string;
	readonly details?: Readonly<Record<string, MarklessDebugJson>>;
}
export interface MarklessDebugChannelV1 {
	readonly version: 1;
	readonly containers: readonly MarklessDebugContainerSnapshot[];
	readonly violations: readonly MarklessDebugViolation[];
	readonly violationCapacity: 100;
	readonly droppedViolationCount: number;
	explainInteraction(element: Element, eventName: string): MarklessDebugInteractionExplanation;
}

declare global {
	const __MARKLESS_DEBUG_ENABLED__: boolean;
	interface Window {
		readonly __MARKLESS_DEBUG__?: MarklessDebugChannelV1;
	}
}

type InteractionInput =
	| Omit<MarklessDebugInlineResumerInteraction, keyof MarklessDebugInteractionBase>
	| Omit<MarklessDebugResumeRecordInteraction, keyof MarklessDebugInteractionBase>
	| Omit<MarklessDebugRowRecordInteraction, keyof MarklessDebugInteractionBase>
	| Omit<MarklessDebugDirectCsrInteraction, keyof MarklessDebugInteractionBase>;
type ViolationInput = Omit<MarklessDebugViolation, 'sequence' | 'timestamp'>;
type RootControls = {
	start(phase: MarklessDebugContainerPhase, active?: boolean): string;
	activate(): void;
	dispose(): void;
	invalidate(element: Element): void;
	record(element: Element, eventName: string, input: InteractionInput): void;
	violation(input: ViolationInput): void;
	router(source: MarklessDebugRouterDelegationInteraction['source']): void;
	boundaries(value: readonly MarklessDebugBoundarySnapshot[]): void;
	disposed(): boolean;
};

// Self-contained because SSR stringifies this installer. Each invocation owns
// one weak root and publishes only the read-only channel; returned controls stay
// inside the framework script/module that requested them.
function installDebugChannelLayer(
	root: Element,
	initialPhase: MarklessDebugContainerPhase,
	initiallyActive = true,
): RootControls {
	const global = globalThis as typeof globalThis & {
		__MARKLESS_DEBUG__?: MarklessDebugChannelV1;
	};
	const previous =
		global.__MARKLESS_DEBUG__?.version === 1 ? global.__MARKLESS_DEBUG__ : undefined;
	let priorRoot: MarklessDebugInteractionExplanation | undefined;
	try {
		priorRoot = previous?.explainInteraction(root, '__markless_debug_root__');
	} catch {}
	const priorContainer =
		priorRoot && 'containerId' in priorRoot
			? previous?.containers.find((entry) => entry.id === priorRoot!.containerId)
			: undefined;
	const seed = `${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
	const id = priorContainer?.id ?? `container:${seed}`;
	const rootKey = priorContainer?.root.key ?? `root:${seed}`;
	const rootRef = new WeakRef(root);
	const events = new WeakMap<Element, Map<string, MarklessDebugInteractionExplanation>>();
	const keys = new WeakMap<Element, string>();
	const invalidated = new WeakSet<Element>();
	const routerSources = ((global as Record<PropertyKey, unknown>)[
		Symbol.for('markless.debug.channel.v1.router-sources')
	] ??= new Set()) as Set<MarklessDebugRouterDelegationInteraction['source']>;
	const ownViolations: MarklessDebugViolation[] = [];
	let phase = initialPhase;
	let lifecycle: MarklessDebugContainerLifecycle = initiallyActive ? 'active' : 'registered';
	let boundarySnapshots: readonly MarklessDebugBoundarySnapshot[] = Object.freeze([]);
	let nextElement = 1;
	let nextSequence = (previous?.violations.at(-1)?.sequence ?? 0) + 1;
	let dropped = 0;
	let pruned = false;
	const freeze = <T>(value: T): T => Object.freeze(value);
	const contains = (element: Element) => {
		const currentRoot = rootRef.deref();
		return (
			!!currentRoot && (currentRoot === element || currentRoot.contains?.(element) === true)
		);
	};
	const keyFor = (element: Element) => {
		let key = keys.get(element);
		if (!key) {
			key = `${rootKey}:element:${nextElement++}`;
			keys.set(element, key);
		}
		return key;
	};
	const eligibleAnchor = (element: Element) => {
		const anchor = element.closest?.('a[href]') as
			| (Element & { href?: string; relList?: { contains(value: string): boolean } })
			| null;
		if (!anchor?.hasAttribute('data-markless-router-link') || anchor.hasAttribute('download'))
			return false;
		const target = anchor.getAttribute('target');
		if ((target && target !== '_self') || anchor.relList?.contains('external')) return false;
		try {
			const base = global.location?.href ?? 'http://localhost/';
			return new URL(anchor.href ?? '', base).origin === new URL(base).origin;
		} catch {
			return false;
		}
	};
	const none = (
		element: Element,
		eventName: string,
		reason: MarklessDebugNoInteraction['reason'],
	) =>
		freeze({
			kind: 'none' as const,
			eventName,
			reason,
			containerId: id,
			elementKey: keyFor(element),
		});
	const explain = (element: Element, eventName: string): MarklessDebugInteractionExplanation => {
		if (lifecycle === 'disposed' && (contains(element) || keys.has(element)))
			return none(element, eventName, 'container-disposed');
		if (!contains(element)) {
			try {
				return (
					previous?.explainInteraction(element, eventName) ??
					freeze({ kind: 'none', eventName, reason: 'outside-known-container' })
				);
			} catch {
				return freeze({ kind: 'none', eventName, reason: 'outside-known-container' });
			}
		}
		if (element.isConnected === false) return none(element, eventName, 'element-disconnected');
		if (eligibleAnchor(element)) {
			const source =
				eventName === 'navigate' && routerSources.has('navigation-event')
					? 'navigation-event'
					: eventName === 'click' && routerSources.has('spa-click-listener')
						? 'spa-click-listener'
						: eventName === 'click' && routerSources.has('ssr-link-bridge')
							? 'ssr-link-bridge'
							: undefined;
			if (source)
				return freeze({
					kind: 'router-delegation',
					source,
					containerId: id,
					elementKey: keyFor(element),
					eventName,
				});
		}
		const interaction = events.get(element)?.get(eventName);
		if (interaction) return freeze({ ...interaction });
		if (invalidated.has(element)) return none(element, eventName, 'not-registered');
		try {
			const prior = previous?.explainInteraction(element, eventName);
			if (prior && prior.kind !== 'none') return prior;
		} catch {}
		return none(element, eventName, 'not-registered');
	};
	const cloneJson = (
		value: unknown,
		seen = new Set<unknown>(),
	): MarklessDebugJson | undefined => {
		if (value === null) return null;
		if (typeof value === 'boolean' || typeof value === 'string') return value;
		if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
		if (!value || typeof value !== 'object' || seen.has(value)) return undefined;
		seen.add(value);
		if (Array.isArray(value)) {
			const copy = value.map((entry) => cloneJson(entry, seen));
			return copy.some((entry) => entry === undefined)
				? undefined
				: freeze(copy as MarklessDebugJson[]);
		}
		if (Object.getPrototypeOf(value) !== Object.prototype) return undefined;
		const copy: Record<string, MarklessDebugJson> = {};
		for (const [name, entry] of Object.entries(value)) {
			const cloned = cloneJson(entry, seen);
			if (cloned === undefined) return undefined;
			copy[name] = cloned;
		}
		return freeze(copy);
	};
	const pushViolation = (input: ViolationInput) => {
		const cloned = input.details === undefined ? undefined : cloneJson(input.details);
		const details =
			cloned && !Array.isArray(cloned) && typeof cloned === 'object'
				? (cloned as Readonly<Record<string, MarklessDebugJson>>)
				: undefined;
		const { details: _details, ...metadata } = input;
		ownViolations.push(
			freeze({
				...metadata,
				...(details ? { details } : {}),
				sequence: nextSequence++,
				timestamp: Date.now(),
			}),
		);
		if (input.details !== undefined && !details)
			ownViolations.push(
				freeze({
					code: 'MARKLESS_DEBUG_DETAILS_DROPPED',
					message: 'Debug violation details were not JSON-safe and were dropped.',
					sequence: nextSequence++,
					timestamp: Date.now(),
				}),
			);
		while (ownViolations.length > 100) {
			ownViolations.shift();
			dropped++;
		}
	};
	const channel: MarklessDebugChannelV1 = freeze({
		version: 1,
		get containers() {
			const inherited = previous?.containers.filter((entry) => entry.id !== id) ?? [];
			if (pruned || lifecycle === 'disposed') return freeze([...inherited]);
			const currentRoot = rootRef.deref();
			const connected = !!currentRoot && currentRoot.isConnected !== false;
			const snapshot = freeze({
				id,
				phase,
				lifecycle: connected ? lifecycle : ('disposed' as const),
				root: freeze({ key: rootKey, connected }),
				boundaries: freeze([...boundarySnapshots]),
			});
			if (!connected) pruned = true;
			return freeze([...inherited, snapshot]);
		},
		get violations() {
			return freeze([...(previous?.violations ?? []), ...ownViolations].slice(-100));
		},
		violationCapacity: 100,
		get droppedViolationCount() {
			return (previous?.droppedViolationCount ?? 0) + dropped;
		},
		explainInteraction: explain,
	});
	Object.defineProperty(global, '__MARKLESS_DEBUG__', {
		configurable: true,
		enumerable: false,
		value: channel,
		writable: false,
	});
	return {
		start(nextPhase, active = true) {
			phase = nextPhase === 'ssr-resume' && phase === 'csr' ? 'csr' : nextPhase;
			if (active) lifecycle = 'active';
			return id;
		},
		activate: () => void (lifecycle === 'disposed' || (lifecycle = 'active')),
		dispose() {
			lifecycle = 'disposed';
			boundarySnapshots = freeze([]);
		},
		invalidate(element) {
			events.delete(element);
			invalidated.add(element);
		},
		record(element, eventName, input) {
			if (lifecycle === 'disposed') return;
			let byName = events.get(element);
			if (!byName) events.set(element, (byName = new Map()));
			const symbolIds = 'symbolIds' in input ? freeze([...input.symbolIds]) : undefined;
			byName.set(
				eventName,
				freeze({
					...input,
					...(symbolIds ? { symbolIds } : {}),
					containerId: id,
					elementKey: keyFor(element),
					eventName,
				} as MarklessDebugInteractionExplanation),
			);
		},
		violation: pushViolation,
		router: (source) => void routerSources.add(source),
		boundaries(value) {
			boundarySnapshots = freeze(value.map((entry) => freeze({ ...entry })));
		},
		disposed: () => lifecycle === 'disposed',
	};
}

let moduleRoots = new WeakMap<Element, RootControls>();
let latestControls: RootControls | undefined;
function controlsFor(
	root: Element,
	phase: MarklessDebugContainerPhase,
	active = true,
): RootControls {
	let controls = moduleRoots.get(root);
	if (!controls || controls.disposed()) {
		controls = installDebugChannelLayer(root, phase, active);
		moduleRoots.set(root, controls);
	} else controls.start(phase, active);
	latestControls = controls;
	return controls;
}
function safely<T>(run: () => T): T | undefined {
	try {
		return run();
	} catch {
		return undefined;
	}
}
export function __marklessDebugBootstrapSource(): string {
	return `((root,phase,active)=>{const controls=(${installDebugChannelLayer.toString()})(root,phase,active);return Object.freeze({record:(element,eventName,input)=>controls.record(element,eventName,input),router:(source)=>controls.router(source),activate:()=>controls.activate()})})`;
}
export function __marklessDebugStartContainer(
	root: Element,
	phase: MarklessDebugContainerPhase,
	active = true,
): string {
	return safely(() => controlsFor(root, phase, active).start(phase, active)) ?? '';
}
export function __marklessDebugActivateContainer(root: Element): void {
	safely(() => controlsFor(root, 'ssr-resume').activate());
}
export function __marklessDebugDisposeContainer(root: Element): void {
	safely(() => moduleRoots.get(root)?.dispose());
}
export function __marklessDebugInvalidateElement(root: Element, element: Element): void {
	safely(() => moduleRoots.get(root)?.invalidate(element));
}
export function __marklessDebugRecordInteraction(
	root: Element,
	element: Element,
	eventName: string,
	input: InteractionInput,
): void {
	safely(() =>
		(moduleRoots.get(root) ?? controlsFor(root, 'csr')).record(element, eventName, input),
	);
}
export function __marklessDebugRecordViolation(input: ViolationInput): void {
	safely(() => latestControls?.violation(input));
}
export function __marklessDebugRegisterRouter(
	root: Element | undefined,
	source: MarklessDebugRouterDelegationInteraction['source'],
): void {
	if (root)
		safely(() => (moduleRoots.get(root) ?? controlsFor(root, 'ssr-resume')).router(source));
	else
		safely(() => {
			(
				((globalThis as Record<PropertyKey, unknown>)[
					Symbol.for('markless.debug.channel.v1.router-sources')
				] ??= new Set()) as Set<MarklessDebugRouterDelegationInteraction['source']>
			).add(source);
			const inlineControls = (globalThis as Record<PropertyKey, unknown>)[
				Symbol.for('markless.debug.channel.v1.bootstrap')
			] as Pick<RootControls, 'router'> | undefined;
			(latestControls ?? inlineControls)?.router(source);
		});
}
export function __marklessDebugSetBoundaries(
	root: Element,
	boundaries: readonly MarklessDebugBoundarySnapshot[],
): void {
	safely(() => moduleRoots.get(root)?.boundaries(boundaries));
}
export function __marklessDebugResetForTest(): void {
	const global = globalThis as typeof globalThis & { __MARKLESS_DEBUG__?: unknown };
	moduleRoots = new WeakMap();
	latestControls = undefined;
	delete global.__MARKLESS_DEBUG__;
	delete (global as Record<PropertyKey, unknown>)[
		Symbol.for('markless.debug.channel.v1.bootstrap')
	];
	delete (global as Record<PropertyKey, unknown>)[
		Symbol.for('markless.debug.channel.v1.router-sources')
	];
}
