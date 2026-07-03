import type { ProtocolStatePayload, ProtocolViewPayload } from '@markless/serializer';
import type { EventOnlyResumeDomElement, EventOnlyResumeDomEvent } from './event-only-resume.ts';
import type { DomJournalEntry } from '@markless/runtime';
import type { RuntimeGraph } from '@markless/runtime';
import type { CsrRenderContainer, CsrRenderOptions, CsrRenderOutput } from './render.ts';
import type { ResumeRuntime, ResumeSymbol } from './resume.ts';

export async function renderCsrRuntime(input: {
	readonly output: CsrRenderOutput;
	readonly options: CsrRenderOptions;
}): Promise<CsrRenderContainer> {
	const { output, options } = input;
	const state = output.state ?? emptyStatePayload();
	const view = output.view ?? emptyViewPayload();
	const loadSymbol = output.loadSymbol ?? options.loadSymbol ?? missingLoadSymbol;

	if (canUseEventOnlyCsrRuntime(output, state, view)) {
		const { createEventOnlyResumeContainerFromPayloads } =
			await import('./event-only-resume.ts');
		const runtime = await createEventOnlyResumeContainerFromPayloads({
			root: output.root as EventOnlyResumeDomElement,
			state,
			view,
			loadSymbol: loadSymbol as unknown as Parameters<
				typeof createEventOnlyResumeContainerFromPayloads
			>[0]['loadSymbol'],
		});
		for (const eventName of new Set(view.events.map((event) => event.eventName))) {
			output.root.addEventListener?.(
				eventName,
				async (event: EventOnlyResumeDomEvent) => {
					await runtime.dispatch(event);
				},
				{ capture: true },
			);
		}
		output.connectRuntime?.({ graph: runtime.graph, runtime });

		return {
			phase: 'csr',
			root: output.root,
			graph: runtime.graph as RuntimeGraph,
			runtime,
		};
	}

	const graph = output.graph ?? (await createFullRuntimeGraph(state, !!output.state));
	const { createResumeRuntime } = await import('./resume.ts');
	let runtime: ResumeRuntime;
	const applyDomJournal =
		options.applyDomJournal ??
		((entries: ReadonlyArray<DomJournalEntry>) => applyDefaultCsrDomJournal(entries, runtime));
	runtime = createResumeRuntime({
		root: output.root,
		graph,
		view,
		loadSymbol,
		createVisibilityObserver: options.createVisibilityObserver,
		createRemovalObserver: options.createRemovalObserver,
		applyDomJournal,
		renderBranchHtml: options.renderBranchHtml ?? globalDocumentBranchHtml(),
	});
	await runtime.start();
	output.connectRuntime?.({ graph, runtime });
	await activateCsrBehaviors(runtime, view);

	return {
		phase: 'csr',
		root: output.root,
		graph,
		runtime,
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
			const branchAnchor = /^branch:(.+?)(:start|:end)$/.exec(String(locator));
			if (branchAnchor) {
				const record = runtime.getBranch(branchAnchor[1]!);
				return branchAnchor[2] === ':end' ? record?.endAnchor : record?.startAnchor;
			}
			return runtime.getElement(String(locator));
		},
	});
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

function canUseEventOnlyCsrRuntime(
	output: CsrRenderOutput,
	state: ProtocolStatePayload,
	view: ProtocolViewPayload,
): boolean {
	if (output.graph) return false;
	if ((state.sharedDefinitions?.length ?? 0) > 0) return false;
	if (state.computed.length > 0) return false;
	if (view.behaviors.length > 0) return false;
	if (view.elementHandles.length > 0) return false;
	if (view.asyncBoundaries.length > 0) return false;
	// Branch flips need graph subscriptions and range replacement.
	if ((view.branches?.length ?? 0) > 0) return false;
	if (view.events.some((event) => event.eventName === 'visible' || !!event.syncPolicy)) {
		return false;
	}
	return true;
}

async function createFullRuntimeGraph(
	state: ProtocolStatePayload,
	hasAuthoredState: boolean,
): Promise<RuntimeGraph> {
	if (hasAuthoredState) {
		const { createRuntimeGraphFromStatePayload } = await import('./payload.ts');
		return createRuntimeGraphFromStatePayload(state);
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
