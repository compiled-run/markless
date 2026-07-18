import type {
	ProtocolStatePayload,
	ProtocolSyncPolicy,
	ProtocolSyncPolicyCondition,
	ProtocolViewPayload,
} from '@markless/serializer';
import type { MarklessExecutionLogMode } from '../dev-log.ts';

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
};

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
type InlineRoot = HTMLElement & {
	__asyncResumeRuntimeStarted?: boolean;
	__marklessEventOnlyGraph?: Map<string, unknown>;
	__marklessEventOnlyGraphInitialized?: boolean;
};
type InlineResumeModule = {
	resumeContainerEvent(input: {
		readonly root: InlineRoot;
		readonly event: Event | 0;
		readonly element?: Element | EventTarget | null;
		readonly eventRecord?: InlineEventRecord | null;
		readonly syncPolicyAlreadyApplied?: boolean;
	}): Promise<void> | void;
};
type InlineSyncPolicyRuntime = {
	decode?: (slot: unknown, records: ReadonlyMap<number, SerializedRecord>) => unknown;
	graph?: (root: InlineRoot) => Map<string, unknown>;
	read?: (root: InlineRoot, graphNodeId: string, path: ReadonlyArray<string>) => unknown;
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

export function createInlineResumerSource(options: InlineResumerBuildOptions): string {
	if (options.debug && (!options.debugBootstrapSource || !options.debugRegistrationSource)) {
		throw new Error('MARKLESS_INLINE_RESUMER_DEBUG_SOURCE_REQUIRED');
	}
	const debugBootstrap = options.debug ? options.debugBootstrapSource : 'undefined';
	const debugRegistration = options.debug ? options.debugRegistrationSource : 'undefined';
	return `{
const __MARKLESS_INLINE_SYNC_POLICY__=${JSON.stringify(options.syncPolicy)};
const __MARKLESS_INLINE_GRAPH_SYNC_POLICY__=${JSON.stringify(options.graphSyncPolicy)};
const __MARKLESS_INLINE_SHARED_GRAPH_POLICY__=${JSON.stringify(options.sharedGraphPolicy)};
const __MARKLESS_INLINE_DEBUG__=${JSON.stringify(options.debug)};
const __MARKLESS_INLINE_EXECUTION_LOG__=${JSON.stringify(options.executionLog)};
const __MARKLESS_INLINE_RESUME_MODULE_URL__=${JSON.stringify(options.resumeModuleUrl)};
const __MARKLESS_INLINE_DEBUG_BOOTSTRAP__=${debugBootstrap};
const __MARKLESS_INLINE_DEBUG_REGISTER__=${debugRegistration};
(${runInlineResumer.toString()})((url) => import(/* @vite-ignore */ url));
}`;
}

export function createInlineResumerDebugRegistrationSource(): string {
	return `(${registerInlineResumerDebug.toString()})`;
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

	if (__MARKLESS_INLINE_EXECUTION_LOG__ !== 'never') {
		const shouldLog = (() => {
			if (__MARKLESS_INLINE_EXECUTION_LOG__ === 'always') return true;
			const currentLocation = location;
			if (
				/^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::|$)/.test(
					currentLocation.origin,
				) ||
				new URLSearchParams(currentLocation.search).has('markless-log')
			)
				return true;
			try {
				return localStorage.getItem('marklessLog') === '1';
			} catch {
				return false;
			}
		})();
		if (shouldLog) {
			const globalScope = globalThis as typeof globalThis & { __mxLog?: Set<string> };
			const executionLog = (globalScope.__mxLog ||= new Set());
			const executed = [...executionLog];
			const preloaded = currentDocument.querySelectorAll('link[rel=modulepreload]').length;
			const app =
				executed.length === 0
					? '0.0 KB app'
					: `${executed.length} app module${executed.length === 1 ? '' : 's'}`;
			const summary = `markless: resumed — ${app} executed, ${preloaded} modules preloaded (${executed.length} app executed) · 0.0 KB instrument`;
			console.log(summary);
			const documentElement = currentDocument.documentElement;
			if (documentElement) {
				documentElement.setAttribute('data-markless-log-summary', summary);
				if (executed.length === 0) {
					documentElement.setAttribute('data-markless-log-app-bytes', '0');
					documentElement.setAttribute('data-markless-log-instrument-bytes', '0');
				} else {
					documentElement.removeAttribute('data-markless-log-app-bytes');
					documentElement.removeAttribute('data-markless-log-instrument-bytes');
				}
			}
		}
	}

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

	const nestedEventNames = new Set([
		...(view.keyedRepeats ?? []).flatMap((repeat) =>
			repeat.rowEvents.map((event) => event.eventName),
		),
		...(view.branches ?? []).flatMap((branch) =>
			(branch.armRecords ?? []).flatMap((arm) => arm.events.map((event) => event.eventName)),
		),
		...view.asyncBoundaries.flatMap((boundary) => {
			const armRecords = boundary.armRecords;
			return armRecords && !Array.isArray(armRecords)
				? (armRecords.events ?? []).map((event) => event.eventName)
				: [];
		}),
	]);
	const eventNames = new Set([
		...view.events.map((event) => event.eventName),
		...nestedEventNames,
	]);
	for (const eventName of eventNames) {
		if (eventName === 'visible') continue;
		root.addEventListener(
			eventName,
			async (event) => {
				if (root.__asyncResumeRuntimeStarted) return;
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
						let syncPolicyAlreadyApplied = false;
						if (__MARKLESS_INLINE_SYNC_POLICY__ && eventRecord.syncPolicy) {
							runSyncPolicy!(eventRecord.syncPolicy, event);
							syncPolicyAlreadyApplied = true;
						}
						const module = await loadModule(resumeModuleUrl);
						await module.resumeContainerEvent({
							root,
							event,
							element,
							eventRecord,
							...(__MARKLESS_INLINE_SYNC_POLICY__
								? { syncPolicyAlreadyApplied }
								: {}),
						});
						return;
					}
					if (element === root) break;
				}
				if (nestedEventNames.has(event.type)) {
					const module = await loadModule(resumeModuleUrl);
					await module.resumeContainerEvent({
						root,
						event,
						element: event.target,
						eventRecord: null,
					});
					return;
				}
				if (__MARKLESS_INLINE_EXECUTION_LOG__ !== 'never' && globalScope.__mxLog) {
					const module = await loadModule(resumeModuleUrl);
					await module.resumeContainerEvent({
						root,
						event,
						element: event.target,
						eventRecord: null,
					});
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
	if (currentScript?.dataset?.marklessSelfWake !== undefined)
		queueMicrotask(async () => {
			if (!root.__asyncResumeRuntimeStarted)
				await (await loadModule(resumeModuleUrl)).resumeContainerEvent({ root, event: 0 });
		});
}
