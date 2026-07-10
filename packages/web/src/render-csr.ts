import type { ProtocolStatePayload, ProtocolViewPayload } from '@markless/serializer';
import type { DomJournalEntry } from '@markless/runtime';
import type { RuntimeGraph } from '@markless/runtime';
import type { CsrRenderContainer, CsrRenderOptions, CsrRenderOutput } from './render.ts';
import type { ResumeRuntime, ResumeRuntimeInput, ResumeSymbol } from './resume.ts';

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
		loadSymbol,
		createVisibilityObserver: options.createVisibilityObserver,
		createRemovalObserver: options.createRemovalObserver,
		applyDomJournal,
		renderBranchHtml: options.renderBranchHtml ?? globalDocumentBranchHtml(),
		demandAsyncBoundaries: true,
	});
	await runtime.start();
	output.connectRuntime?.({ graph, runtime });
	await activateCsrBehaviors(runtime, view);
	await marklessLogCsrSummary();

	return {
		phase: 'csr',
		root: output.root,
		graph,
		runtime,
	};
}

async function marklessLogCsrSummary(): Promise<void> {
	const global = globalThis as ExecutionLogGlobal;
	if (!global.__mxLog) return;
	try {
		const log = await global.__mxLoadLog?.();
		await log?.logMarklessRenderSummary?.();
	} catch {
		// Execution logging is observability only; render must not depend on it.
	}
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
	if (!callbacks || Object.keys(callbacks).length === 0) return loadSymbol;
	return (symbolId) => {
		const callback = callbacks[symbolId];
		if (!callback) return loadSymbol(symbolId);
		return async (context) => {
			const event = context.event as Record<string, unknown> | undefined;
			if (event) event.__marklessCsrCallbackDispatched = true;
			const result = callback(context.event);
			if (isPromiseLike(result)) await result;
		};
	};
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
