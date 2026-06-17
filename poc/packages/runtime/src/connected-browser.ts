import type { PipelineManifest, PipelineReceipt } from '../../protocol/src/index.ts';

export type ConnectedBrowserGraphState = {
	readonly selectedId: 'app' | 'symbol' | 'runtime';
	readonly open: boolean;
	readonly message: string;
	readonly revision: number;
};

export type ConnectedBrowserDomJournalEntry =
	| {
			readonly kind: 'setText';
			readonly targetId: string;
			readonly value: string;
	  }
	| {
			readonly kind: 'setAttr';
			readonly targetId: string;
			readonly name: string;
			readonly value: string;
	  };

export type ConnectedBrowserConstraints = {
	readonly componentBodiesRunOnResume: false;
	readonly usesHydration: false;
	readonly usesVdom: false;
};

export type ConnectedBrowserResumeResult = {
	readonly serializedGraphRead: ConnectedBrowserGraphState;
	readonly componentBodyRunsDuringResume: 0;
};

export type ConnectedBrowserDispatchInit = {
	readonly key?: string;
};

export type ConnectedBrowserDispatchResult = {
	readonly eventName: 'click' | 'keydown';
	readonly targetId: string;
	readonly loadedSymbolId: string;
	readonly defaultPrevented: boolean;
	readonly syncPolicyApplied: boolean;
};

export type ConnectedBrowserPage = {
	readonly mode: 'browser-page';
	readonly html: string;
	readonly load: () => Promise<void>;
	readonly resume: () => Promise<ConnectedBrowserResumeResult>;
	readonly dispatch: (
		eventName: 'click' | 'keydown',
		targetId: string,
		init?: ConnectedBrowserDispatchInit,
	) => Promise<ConnectedBrowserDispatchResult>;
	readonly text: (targetId: string) => string | undefined;
	readonly attr: (targetId: string, name: string) => string | undefined;
	readonly graph: () => ConnectedBrowserGraphState;
	readonly domJournal: () => ReadonlyArray<ConnectedBrowserDomJournalEntry>;
	readonly receipts: () => ReadonlyArray<PipelineReceipt>;
	readonly constraints: () => ConnectedBrowserConstraints;
};

export type ConnectedBrowserPageInput = {
	readonly artifact: {
		readonly filename: string;
		readonly transformedModule: {
			readonly code: string;
		};
		readonly manifest: PipelineManifest;
	};
};

type MutableGraphState = {
	selectedId: 'app' | 'symbol' | 'runtime';
	open: boolean;
	message: string;
	revision: number;
};

type ElementRecord = {
	text: string;
	attrs: Map<string, string>;
};

const moduleTitles: Record<ConnectedBrowserGraphState['selectedId'], string> = {
	app: 'App module',
	symbol: 'Generated symbol chunk',
	runtime: 'Runtime-facing module',
};

export function createConnectedBrowserPageFromBundlerOutput(
	input: ConnectedBrowserPageInput,
): ConnectedBrowserPage {
	const state: MutableGraphState = {
		selectedId: 'app',
		open: true,
		message: 'pipeline ready',
		revision: 0,
	};
	const serializedGraph: ConnectedBrowserGraphState = snapshot(state);
	const eventSymbols = eventSymbolsFor(input.artifact.manifest);
	const elements = new Map<string, ElementRecord>();
	const journal: ConnectedBrowserDomJournalEntry[] = [];
	const receipts: PipelineReceipt[] = [];
	const html = connectedPageHtml({
		moduleId: input.artifact.filename,
		transformedCode: input.artifact.transformedModule.code,
		state: serializedGraph,
		eventSymbols,
	});
	let loaded = false;
	let resumed = false;

	return {
		mode: 'browser-page',
		html,
		async load() {
			loaded = true;
			seedElements(elements, state);
			receipts.push(
				receipt('page-load', input.artifact.filename, {
					loadedFromBundlerOutput: true,
					virtualModules: input.artifact.manifest.virtualModules.map(
						(module) => module.id,
					),
				}),
			);
		},
		async resume() {
			if (!loaded) {
				throw new Error('Cannot resume connected browser page before load().');
			}

			resumed = true;
			receipts.push(
				receipt('resume-graph-read', input.artifact.filename, {
					state: serializedGraph,
					componentBodyRunsDuringResume: 0,
				}),
			);
			applyJournal(elements, journal, receipts, [
				{
					kind: 'setText',
					targetId: 'pipeline-label',
					value: pipelineLabel(state),
				},
				{
					kind: 'setAttr',
					targetId: 'page-root',
					name: 'data-open',
					value: String(state.open),
				},
			]);

			return {
				serializedGraphRead: serializedGraph,
				componentBodyRunsDuringResume: 0,
			};
		},
		async dispatch(eventName, targetId, init = {}) {
			if (!resumed) {
				throw new Error('Cannot dispatch connected browser event before resume().');
			}

			receipts.push(
				receipt('delegated-event-dispatch', input.artifact.filename, {
					eventName,
					targetId,
				}),
			);

			const syncPolicyApplied =
				eventName === 'keydown' && init.key === 'Escape' && state.open === true;
			const defaultPrevented = syncPolicyApplied;

			if (eventName === 'keydown') {
				receipts.push(
					receipt('sync-policy-evaluate', eventSymbols.keydown, {
						eventName,
						key: init.key ?? null,
						applied: syncPolicyApplied,
						methods: syncPolicyApplied ? ['preventDefault'] : [],
					}),
				);
			}

			const loadedSymbolId = eventSymbols[eventName];
			receipts.push(
				receipt('lazy-symbol-load', loadedSymbolId, {
					eventName,
					targetId,
					importOwner: 'generated-symbol-resolver',
				}),
			);
			runLazyHandler({ eventName, targetId, syncPolicyApplied, state, receipts });
			applyJournal(elements, journal, receipts, [
				{
					kind: 'setText',
					targetId: 'pipeline-label',
					value: pipelineLabel(state),
				},
				{
					kind: 'setAttr',
					targetId: 'page-root',
					name: 'data-open',
					value: String(state.open),
				},
				{
					kind: 'setAttr',
					targetId: 'page-root',
					name: 'data-selected',
					value: state.selectedId,
				},
			]);

			return {
				eventName,
				targetId,
				loadedSymbolId,
				defaultPrevented,
				syncPolicyApplied,
			};
		},
		text(targetId) {
			return elements.get(targetId)?.text;
		},
		attr(targetId, name) {
			return elements.get(targetId)?.attrs.get(name);
		},
		graph() {
			return snapshot(state);
		},
		domJournal() {
			return [...journal];
		},
		receipts() {
			return [...receipts];
		},
		constraints() {
			return {
				componentBodiesRunOnResume: false,
				usesHydration: false,
				usesVdom: false,
			};
		},
	};
}

function eventSymbolsFor(manifest: PipelineManifest): {
	readonly click: string;
	readonly keydown: string;
} {
	const symbolIds = manifest.transformedModules.flatMap((module) => module.symbolIds);
	const click = symbolIds.find((symbolId) => symbolId.includes('#click_'));
	const keydown = symbolIds.find((symbolId) => symbolId.includes('#keydown_'));

	if (!click || !keydown) {
		throw new Error('Connected browser POC requires click and keydown symbol IDs.');
	}

	return { click, keydown };
}

function connectedPageHtml(input: {
	readonly moduleId: string;
	readonly transformedCode: string;
	readonly state: ConnectedBrowserGraphState;
	readonly eventSymbols: { readonly click: string; readonly keydown: string };
}): string {
	return [
		'<main id="page-root" data-selected="app" data-open="true">',
		`  <h1 id="pipeline-label">${escapeHtml(pipelineLabel(input.state))}</h1>`,
		'  <input id="filter-input" />',
		'  <button id="select-symbol" type="button">Select symbol</button>',
		'  <output id="journal-output"></output>',
		'</main>',
		`<script type="arcade/state">${JSON.stringify(input.state)}</script>`,
		`<script type="arcade/view">${JSON.stringify({
			moduleId: input.moduleId,
			events: [
				{
					targetId: 'select-symbol',
					eventName: 'click',
					symbolId: input.eventSymbols.click,
				},
				{
					targetId: 'filter-input',
					eventName: 'keydown',
					symbolId: input.eventSymbols.keydown,
					syncPolicy: {
						methods: ['preventDefault'],
						reads: ['pipeline.open', 'event.key'],
					},
				},
			],
		})}</script>`,
		`<script type="module">${input.transformedCode}</script>`,
	].join('\n');
}

function seedElements(elements: Map<string, ElementRecord>, state: MutableGraphState): void {
	elements.set('page-root', {
		text: '',
		attrs: new Map([
			['data-selected', state.selectedId],
			['data-open', String(state.open)],
		]),
	});
	elements.set('pipeline-label', {
		text: pipelineLabel(state),
		attrs: new Map(),
	});
	elements.set('filter-input', {
		text: '',
		attrs: new Map(),
	});
	elements.set('select-symbol', {
		text: 'Select symbol',
		attrs: new Map([['type', 'button']]),
	});
}

function runLazyHandler(input: {
	readonly eventName: 'click' | 'keydown';
	readonly targetId: string;
	readonly syncPolicyApplied: boolean;
	readonly state: MutableGraphState;
	readonly receipts: PipelineReceipt[];
}): void {
	if (input.eventName === 'click' && input.targetId === 'select-symbol') {
		input.state.selectedId = 'symbol';
		input.state.revision++;
		input.state.message = 'selected:symbol';
		input.receipts.push(
			receipt('graph-write', 'pipeline.selectedId', {
				path: 'pipeline.selectedId',
				value: input.state.selectedId,
			}),
		);
		input.receipts.push(
			receipt('graph-write', 'pipeline.revision', {
				path: 'pipeline.revision',
				value: input.state.revision,
			}),
		);
		input.receipts.push(
			receipt('graph-write', 'pipeline.message', {
				path: 'pipeline.message',
				value: input.state.message,
			}),
		);
		return;
	}

	if (input.eventName === 'keydown' && input.syncPolicyApplied) {
		input.state.open = false;
		input.state.message = 'sync-policy:closed';
		input.receipts.push(
			receipt('graph-write', 'pipeline.open', {
				path: 'pipeline.open',
				value: input.state.open,
			}),
		);
		input.receipts.push(
			receipt('graph-write', 'pipeline.message', {
				path: 'pipeline.message',
				value: input.state.message,
			}),
		);
	}
}

function applyJournal(
	elements: Map<string, ElementRecord>,
	journal: ConnectedBrowserDomJournalEntry[],
	receipts: PipelineReceipt[],
	entries: ReadonlyArray<ConnectedBrowserDomJournalEntry>,
): void {
	for (const entry of entries) {
		journal.push(entry);
		const element = elements.get(entry.targetId);

		if (!element) continue;

		if (entry.kind === 'setText') {
			element.text = entry.value;
		} else {
			element.attrs.set(entry.name, entry.value);
		}

		receipts.push(receipt('dom-journal-apply', entry.targetId, entry));
	}
}

function receipt(
	stage: PipelineReceipt['stage'],
	moduleId: string,
	details: Readonly<Record<string, unknown>>,
): PipelineReceipt {
	return {
		stage,
		moduleId,
		inspectable: true,
		summary: connectedBrowserReceiptSummary(stage),
		details,
	};
}

function connectedBrowserReceiptSummary(stage: PipelineReceipt['stage']): string {
	switch (stage) {
		case 'page-load':
			return 'Connected-browser POC loaded one page from bundler output.';
		case 'resume-graph-read':
			return 'Connected-browser POC read serialized graph state during resume.';
		case 'delegated-event-dispatch':
			return 'Connected-browser POC dispatched an event through delegated wiring.';
		case 'sync-policy-evaluate':
			return 'Connected-browser POC evaluated synchronous browser event policy.';
		case 'lazy-symbol-load':
			return 'Connected-browser POC resolved a lazy symbol through the generated owner.';
		case 'graph-write':
			return 'Connected-browser POC applied a graph write from lazy symbol behavior.';
		case 'dom-journal-apply':
			return 'Connected-browser POC applied a concrete DOM journal mutation.';
		default:
			return 'Connected-browser POC receipt.';
	}
}

function pipelineLabel(state: ConnectedBrowserGraphState): string {
	return `${moduleTitles[state.selectedId]}:r${state.revision}:${state.message}`;
}

function snapshot(state: MutableGraphState): ConnectedBrowserGraphState {
	return {
		selectedId: state.selectedId,
		open: state.open,
		message: state.message,
		revision: state.revision,
	};
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}
