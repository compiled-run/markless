import type { ProtocolStatePayload, ProtocolViewPayload } from '@markless/serializer';
import type { DomJournalEntry } from '@markless/runtime';
import type { RuntimeGraph } from '@markless/runtime';
import type { CsrRenderContainer, CsrRenderOptions, CsrRenderOutput } from './render.ts';
import type { ResumeRuntime, ResumeRuntimeInput, ResumeSymbol } from './resume.ts';

declare const __MARKLESS_DEV_ENABLED__: boolean;

type ExecutionLogGlobal = typeof globalThis & {
	__mxLog?: Set<string>;
	__mxLoadLog?: () => Promise<{
		readonly logMarklessRenderSummary?: (input?: unknown) => unknown;
	}>;
};

export async function renderCsrRuntime(input: {
	readonly output: CsrRenderOutput;
	readonly options: CsrRenderOptions;
}): Promise<CsrRenderContainer> {
	const { output, options } = input;
	if (typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' && __MARKLESS_DEBUG_ENABLED__)
		void import('./debug-channel.ts')
			.then((debug) =>
				debug.__marklessDebugStartContainer(
					output.root as unknown as Element,
					'csr',
					false,
				),
			)
			.catch(() => {});
	// CSR boundaries whose initial arm must settle are themselves a declared
	// load-time capability. Keep their coordinate-only path; ordinary CSR pages
	// remain graph-free until interaction.
	if (!output.view?.asyncBoundaries.length) {
		const state = output.state ?? emptyStatePayload();
		const view = output.view ?? emptyViewPayload();
		const loadSymbol = withCsrCallbackSymbols(
			output.loadSymbol ?? options.loadSymbol ?? missingLoadSymbol,
			view,
		);

		let graph: RuntimeGraph | undefined;
		let runtime: ResumeRuntime | undefined;
		let starting: Promise<ResumeRuntime> | undefined;
		let disposed = false;
		const cleanup = await activateAuthoredBehaviors(
			output,
			view,
			output.loadBehaviorSymbol ?? loadSymbol,
		);
		const demandRuntime = async (): Promise<ResumeRuntime> => {
			if (runtime) return runtime;
			if (!starting)
				starting = (async () => {
					graph =
						output.graph ??
						(await createFullRuntimeGraph({
							state,
							view,
							root: output.root,
							loadSymbol,
							hasAuthoredState: !!output.state,
						}));
					const { createResumeRuntime } = await import('./resume.ts');
					const runtimeView = {
						...view,
						behaviors: [],
					};
					const applyDomJournal =
						options.applyDomJournal ??
						((entries: ReadonlyArray<DomJournalEntry>) =>
							applyDefaultCsrDomJournal(entries, runtime!));
					runtime = createResumeRuntime({
						root: output.root,
						graph,
						state,
						view: runtimeView,
						liveHostNodes: output.liveHostNodes,
						loadSymbol,
						createVisibilityObserver: options.createVisibilityObserver,
						createRemovalObserver: options.createRemovalObserver,
						applyDomJournal,
						renderBranchHtml: options.renderBranchHtml ?? globalDocumentBranchHtml(),
						demandAsyncBoundaries: true,
					});
					output.connectRuntime?.({ graph, runtime });
					await runtime.start();
					if (disposed) runtime.dispose();
					return runtime;
				})();
			return starting;
		};
		const deferredRuntime: ResumeRuntime = {
			start: async () => void (await demandRuntime()),
			async dispatch(event, dispatchOptions) {
				if (!event) return;
				await (await demandRuntime()).dispatch(event, dispatchOptions);
			},
			async activateBehaviors(hostNodeId) {
				await (await demandRuntime()).activateBehaviors(hostNodeId);
			},
			getElement(hostNodeId) {
				return runtime?.getElement(hostNodeId) ?? output.liveHostNodes?.get(hostNodeId);
			},
			getAsyncBoundary(boundaryId) {
				return runtime?.getAsyncBoundary(boundaryId);
			},
			getBranch(branchId) {
				return runtime?.getBranch(branchId);
			},
			disposeHost(hostNodeId) {
				runtime?.disposeHost(hostNodeId);
			},
			dispose() {
				disposed = true;
				removeDelegatedTriggers();
				for (const release of cleanup.splice(0).reverse()) release();
				runtime?.dispose();
			},
			whenAsyncBoundariesSettled: async () =>
				(await demandRuntime()).whenAsyncBoundariesSettled?.(),
			holdPendingSettleCommits: async (ms) =>
				(await demandRuntime()).holdPendingSettleCommits?.(ms),
		};
		const removeDelegatedTriggers = installDelegatedTriggers(output, view, async (event) => {
			output.root.__marklessDelegatedDispatch = true;
			await (await demandRuntime()).dispatch(event);
		});
		if (typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' && __MARKLESS_DEBUG_ENABLED__)
			await registerDelegatedTriggerDebug(output, view);
		if ((globalThis as ExecutionLogGlobal).__mxLog) await marklessLogCsrSummary();
		return Object.defineProperty(
			{
				phase: 'csr' as const,
				root: output.root,
				runtime: deferredRuntime,
			},
			'graph',
			{
				enumerable: true,
				get() {
					if (!graph) throw new Error('MARKLESS_CSR_GRAPH_NOT_DEMANDED');
					return graph;
				},
			},
		) as CsrRenderContainer;
	}
	const state = output.state ?? emptyStatePayload();
	const view = output.view ?? emptyViewPayload();
	const loadSymbol = withCsrCallbackSymbols(
		output.loadSymbol ?? options.loadSymbol ?? missingLoadSymbol,
		view,
	);

	const graph =
		output.graph ??
		(await createFullRuntimeGraph({
			state,
			view,
			root: output.root,
			loadSymbol,
			hasAuthoredState: !!output.state,
		}));
	if ((view.keyedRepeats?.length ?? 0) > 0) {
		const { validateKeyedRepeatGraphKeys } = await import('./repeat-runtime.ts');
		validateKeyedRepeatGraphKeys(graph, view);
	}
	const { createResumeRuntime } = await import('./resume.ts');
	let runtime: ResumeRuntime;
	const applyDomJournal =
		options.applyDomJournal ??
		((entries: ReadonlyArray<DomJournalEntry>) => applyDefaultCsrDomJournal(entries, runtime));
	runtime = createResumeRuntime({
		root: output.root,
		graph,
		state,
		view,
		liveHostNodes: output.liveHostNodes,
		loadSymbol,
		createVisibilityObserver: options.createVisibilityObserver,
		createRemovalObserver: options.createRemovalObserver,
		applyDomJournal,
		renderBranchHtml: options.renderBranchHtml ?? globalDocumentBranchHtml(),
		demandAsyncBoundaries: true,
	});
	output.connectRuntime?.({ graph, runtime });
	await runtime.start();
	if (view.behaviors.length) await activateCsrBehaviors(runtime, view);
	if ((globalThis as ExecutionLogGlobal).__mxLog) await marklessLogCsrSummary();
	return {
		phase: 'csr',
		root: output.root,
		graph,
		runtime,
	};
}

async function registerDelegatedTriggerDebug(
	output: CsrRenderOutput,
	view: ProtocolViewPayload,
): Promise<void> {
	const debug = await import('./debug-channel.ts');
	debug.__marklessDebugStartContainer(output.root as unknown as Element, 'csr', false);
	for (const record of view.events) {
		if (record.eventName === 'visible') continue;
		const element =
			output.liveHostNodes?.get(record.hostNodeId) ??
			(view.locators.length === 1 && view.locators[0]?.hostNodeId === record.hostNodeId
				? output.root
				: undefined);
		if (!element) continue;
		debug.__marklessDebugRecordInteraction(
			output.root as unknown as Element,
			element as unknown as Element,
			record.eventName,
			{
				kind: 'delegated-csr',
				source: 'chunk-event',
				hostNodeId: record.hostNodeId,
				symbolIds: record.symbolIds ?? [],
			},
		);
	}
}

async function marklessLogCsrSummary(): Promise<void> {
	const global = globalThis as ExecutionLogGlobal;
	try {
		const log = await global.__mxLoadLog?.();
		await log?.logMarklessRenderSummary?.();
	} catch {
		// Execution logging is observability only; render must not depend on it.
	}
}

async function activateAuthoredBehaviors(
	output: CsrRenderOutput,
	view: ProtocolViewPayload,
	loadSymbol: ResumeRuntimeInput['loadSymbol'],
): Promise<Array<() => void>> {
	const cleanup: Array<() => void> = [];
	for (const behavior of view.behaviors) {
		if (!behavior.symbolId) continue;
		const element =
			output.liveHostNodes?.get(behavior.hostNodeId) ??
			(view.locators.length === 1 && view.locators[0]?.hostNodeId === behavior.hostNodeId
				? output.root
				: undefined);
		if (!element)
			throw new Error(`MARKLESS_CSR_BEHAVIOR_HOST_MISSING: ${behavior.hostNodeId}`);
		const symbol = await loadSymbol(behavior.symbolId);
		const result = await symbol({
			graph: undefined as unknown as RuntimeGraph,
			element,
			getElementHandle: () => undefined,
			behaviorInputs: behavior.inputValues ?? [],
		});
		if (typeof result === 'function') cleanup.push(result);
	}
	return cleanup;
}

function installDelegatedTriggers(
	output: CsrRenderOutput,
	view: ProtocolViewPayload,
	dispatch: (event: NonNullable<Parameters<ResumeRuntime['dispatch']>[0]>) => Promise<void>,
): () => void {
	const recordsByElement = new Map<object, Set<string>>();
	for (const record of view.events) {
		if (record.eventName === 'visible') continue;
		const element =
			output.liveHostNodes?.get(record.hostNodeId) ??
			(view.locators.length === 1 && view.locators[0]?.hostNodeId === record.hostNodeId
				? output.root
				: undefined);
		if (!element) continue;
		const names = recordsByElement.get(element) ?? new Set<string>();
		names.add(record.eventName);
		recordsByElement.set(element, names);
	}
	const rowEventNames = new Set(
		(view.keyedRepeats ?? []).flatMap((repeat) =>
			repeat.rowEvents.map((event) => event.eventName),
		),
	);
	const eventNames = new Set([
		...view.events.map((record) => record.eventName),
		...rowEventNames,
	]);
	eventNames.delete('visible');
	const releases: Array<() => void> = [];
	for (const eventName of eventNames) {
		const listener = async (event: NonNullable<Parameters<ResumeRuntime['dispatch']>[0]>) => {
			let matched = rowEventNames.has(event.type);
			for (
				let element = event.target;
				element && !matched;
				element = element.parentElement ?? null
			)
				matched = recordsByElement.get(element)?.has(event.type) === true;
			if (!matched) {
				if (typeof __MARKLESS_DEV_ENABLED__ === 'undefined' || __MARKLESS_DEV_ENABLED__)
					throw new Error(`MARKLESS_CSR_DELEGATED_TRIGGER_UNMATCHED: ${event.type}`);
				return;
			}
			await dispatch(event);
		};
		output.root.addEventListener?.(eventName, listener, { capture: true });
		releases.push(() =>
			output.root.removeEventListener?.(eventName, listener, { capture: true }),
		);
	}
	return () => {
		for (const release of releases.splice(0)) release();
	};
}

type CsrDomJournalTarget = {
	textContent?: string | null;
	setAttribute?: (name: string, value: string) => void;
	removeAttribute?: (name: string) => void;
	readonly [name: string]: unknown;
};

async function applyDefaultCsrDomJournal(
	entries: ReadonlyArray<DomJournalEntry>,
	runtime: ResumeRuntime,
): Promise<void> {
	const deferred: DomJournalEntry[] = [];
	for (const entry of entries) {
		if (entry.type === 'setText') {
			const target = runtime.getElement(String(entry.locator)) as
				| CsrDomJournalTarget
				| undefined;
			if (target) target.textContent = stringifyDomValue(entry.value);
			continue;
		}
		if (entry.type === 'setAttr') {
			const target = runtime.getElement(String(entry.locator)) as
				| CsrDomJournalTarget
				| undefined;
			if (!target) continue;
			if (entry.value == null || entry.value === false) {
				target.removeAttribute?.(entry.name);
			} else {
				target.setAttribute?.(entry.name, stringifyDomValue(entry.value));
			}
			continue;
		}
		if (entry.type === 'setProp') {
			const target = runtime.getElement(String(entry.locator)) as
				| Record<string, unknown>
				| undefined;
			if (target) target[entry.name] = entry.value;
			continue;
		}
		deferred.push(entry);
	}

	if (deferred.length === 0) return;
	const { applyDomJournalEntries } = await import('./dom-journal.ts');
	applyDomJournalEntries(deferred, {
		resolveTarget(locator) {
			const rangeAnchor = /^(branch|async-boundary):(.+?):(start|end)$/.exec(String(locator));
			if (rangeAnchor) {
				const record =
					rangeAnchor[1] === 'branch'
						? runtime.getBranch(rangeAnchor[2]!)
						: runtime.getAsyncBoundary(rangeAnchor[2]!);
				const target = rangeAnchor[3] === 'end' ? record?.endAnchor : record?.startAnchor;
				if (!target) throw missingCsrJournalTargetError(String(locator));
				return target;
			}
			return runtime.getElement(String(locator));
		},
	});
}

function withCsrCallbackSymbols(
	loadSymbol: ResumeRuntimeInput['loadSymbol'],
	view: ProtocolViewPayload,
): ResumeRuntimeInput['loadSymbol'] {
	const callbacks = (
		view as ProtocolViewPayload & {
			readonly __marklessCsrCallbacks?: Readonly<Record<string, (event: unknown) => unknown>>;
		}
	).__marklessCsrCallbacks;
	return callbacks
		? (symbolId) => {
				const callback = callbacks[symbolId];
				if (!callback) return loadSymbol(symbolId);
				return async (context) => {
					const event = context.event as Record<string, unknown> | undefined;
					if (event) event.__marklessCsrCallbackDispatched = true;
					const result = callback(context.event);
					if (isPromiseLike(result)) await result;
				};
			}
		: loadSymbol;
}

function missingCsrJournalTargetError(locator: string): Error {
	const error = new Error(
		`MARKLESS_CSR_DOM_JOURNAL_TARGET_MISSING: CSR DOM journal could not resolve ${locator}.`,
	) as Error & Record<string, unknown>;
	error.name = 'RuntimeResumeError';
	error.code = 'MARKLESS_CSR_DOM_JOURNAL_TARGET_MISSING';
	error.phase = 'runtime';
	error.locator = locator;
	error.dispatchModuleId = 'web:render-csr';
	error.docsUrl = 'https://markless.dev/errors/MARKLESS_CSR_DOM_JOURNAL_TARGET_MISSING';
	return error;
}

function stringifyDomValue(value: unknown): string {
	if (value == null) return '';
	return String(value);
}

async function activateCsrBehaviors(
	runtime: ResumeRuntime,
	view: ProtocolViewPayload,
): Promise<void> {
	const hostNodeIds = new Set<string>();
	for (const behavior of view.behaviors) {
		if (behavior.symbolId) hostNodeIds.add(behavior.hostNodeId);
	}
	for (const hostNodeId of hostNodeIds) {
		await runtime.activateBehaviors(hostNodeId);
	}
}

const EMPTY_PROTOCOL_VERSION = 1 satisfies ProtocolStatePayload['version'];

function emptyStatePayload(): ProtocolStatePayload {
	return {
		version: EMPTY_PROTOCOL_VERSION,
		cells: [],
		computed: [],
	};
}

function emptyViewPayload(): ProtocolViewPayload {
	return {
		version: EMPTY_PROTOCOL_VERSION,
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
}

function missingLoadSymbol(symbolId: string): ResumeSymbol {
	throw new Error(`Cannot load async symbol ${symbolId} without a generated symbol resolver.`);
}

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
	return (
		value !== null &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof (value as { readonly then?: unknown }).then === 'function'
	);
}

// CSR mounts share the resume graph wiring so async boundary runners load
// through the same generated symbol resolver as browser resume.
async function createFullRuntimeGraph(input: {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
	readonly root: CsrRenderOutput['root'];
	readonly loadSymbol: NonNullable<CsrRenderOutput['loadSymbol']>;
	readonly hasAuthoredState: boolean;
}): Promise<RuntimeGraph> {
	if (input.hasAuthoredState) {
		const { createRuntimeGraphFromResumePayload } =
			await import('./payload-graph-construct.ts');
		return await createRuntimeGraphFromResumePayload({
			state: input.state,
			view: input.view,
			root: input.root,
			loadSymbol: input.loadSymbol,
		});
	}

	const { createRuntimeGraph } = await import('@markless/runtime');
	return createRuntimeGraph({ cells: [] });
}

// CSR runs where the compiled module already used the document global to
// build its root, so the same document parses branch flip fragments.
function globalDocumentBranchHtml():
	| ((html: string) => ReadonlyArray<import('./resume.ts').ResumeDomNode>)
	| undefined {
	const documentHost = (
		globalThis as {
			readonly document?: {
				readonly createElement?: (tagName: string) => {
					innerHTML: string;
					readonly content?: { readonly childNodes?: ArrayLike<unknown> };
				};
			};
		}
	).document;
	if (typeof documentHost?.createElement !== 'function') return undefined;
	return (html) => {
		const template = documentHost.createElement!('template');
		template.innerHTML = html;
		return Array.from(template.content?.childNodes ?? []) as ReadonlyArray<
			import('./resume.ts').ResumeDomNode
		>;
	};
}
