import {
	decodePayloadScripts,
	type DecodedPayloadScripts,
	type EncodedPayloadScripts,
	RuntimePayloadError,
	type RuntimePayloadDiagnostic,
	type RuntimePayloadErrorCode,
	type RuntimePayloadType,
} from '../../serializer/src/protocol-validation.ts';
import type { SerializedGraphPayload } from '../../serializer/src/value-decode-client.ts';
import type { ProtocolStatePayload, ProtocolViewPayload } from '@markless/serializer/protocol';
import type { ResumeDomElement, ResumeRuntime, ResumeRuntimeInput } from './resume.ts';

export {
	decodePayloadScripts,
	RuntimePayloadError,
	type RuntimePayloadDiagnostic,
	type RuntimePayloadErrorCode,
	type RuntimePayloadType,
};
export type PayloadScriptElement = {
	readonly textContent?: string | null;
	readonly text?: string | null;
	readonly innerHTML?: string | null;
};
export type PayloadScriptDocument = {
	readonly querySelector: (selector: string) => PayloadScriptElement | null;
};
type RuntimeModule = typeof import('@markless/runtime');
type RuntimeGraph = import('@markless/runtime').RuntimeGraph;
type RuntimeGraphRead = import('@markless/runtime').RuntimeGraphRead;

export type ResumePayloadScriptsInput = EncodedPayloadScripts & Pick<
	ResumeRuntimeInput,
	| 'loadSymbol'
	| 'createVisibilityObserver'
	| 'createRemovalObserver'
	| 'applyDomJournal'
	| 'renderBranchHtml'> & { readonly root: ResumeDomElement };

export type ResumePayloadDocumentInput = Omit<
	ResumePayloadScriptsInput,
	'stateScript' | 'viewScript'
> & { readonly document: PayloadScriptDocument };

export type ResumePayloadScriptsResult = {
	readonly decoded: DecodedPayloadScripts;
	readonly graph: RuntimeGraph;
	readonly runtime: ResumeRuntime;
	readonly warnings?: ReadonlyArray<ResumeAlreadyResumedWarning>;
};

export type ResumeAlreadyResumedWarning = {
	readonly code: 'MARKLESS_RESUME_ALREADY_RESUMED';
	readonly severity: 'warning';
	readonly phase: 'resume';
	readonly title: string;
	readonly message: string;
	readonly why: string;
	readonly suggestions: ReadonlyArray<{ readonly message: string }>;
	readonly docsUrl: string;
};

const resumedPayloadContainers = new WeakMap<ResumeDomElement, ResumePayloadScriptsResult>();
let runtimeModulePromise: Promise<RuntimeModule> | undefined;
let valueDecoderPromise:
	| Promise<typeof import('../../serializer/src/value-decode-client.ts')>
	| undefined;

export async function createRuntimeGraphFromStatePayload(
	payload: ProtocolStatePayload,
): Promise<RuntimeGraph> {
	const { createRuntimeGraph } = await runtimeModule();
	return createRuntimeGraph({
		cells: await decodeStateCells(payload),
		sharedDefinitions: payload.sharedDefinitions,
	});
}

async function decodeStateCells(payload: ProtocolStatePayload) {
	return Promise.all(
		payload.cells.map(async (cell) => ({
			graphNodeId: cell.graphNodeId,
			value: cell.value === undefined
				? undefined
				: await deserializeGraphValue(cell.value as SerializedGraphPayload),
		})),
	);
}

export async function createRuntimeGraphFromResumePayload(input: {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
	readonly root: ResumeDomElement;
	readonly loadSymbol: ResumeRuntimeInput['loadSymbol'];
}): Promise<RuntimeGraph> {
	const { createRuntimeGraph } = await runtimeModule();
	let graph!: RuntimeGraph;
	const asyncComputed = await asyncComputedFromPayload(input, () => graph);
	graph = createRuntimeGraph({
		cells: await decodeStateCells(input.state),
		sharedDefinitions: input.state.sharedDefinitions,
		asyncComputed,
	});
	return graph;
}

export async function resumeFromPayloadScripts(
	input: ResumePayloadScriptsInput,
): Promise<ResumePayloadScriptsResult> {
	const resumed = alreadyResumedPayload(input.root);
	if (resumed) return resumed;

	const decoded = decodePayloadScripts(input);
	const graph = await createRuntimeGraphFromResumePayload({
		state: decoded.state,
		view: decoded.view,
		root: input.root,
		loadSymbol: input.loadSymbol,
	});
	let runtime: ResumeRuntime | undefined;
	const applyDomJournal =
		input.applyDomJournal ??
		(async (entries) => {
			const { applyDomJournalEntries } = await import('./dom-journal.ts');
			applyDomJournalEntries(entries, {
				resolveTarget(locator) {
					const rangeAnchor = /^(branch|async-boundary):(.+?):(start|end)$/.exec(
						String(locator),
					);
					if (rangeAnchor) {
						const record =
							rangeAnchor[1] === 'branch'
								? runtime?.getBranch(rangeAnchor[2]!)
								: runtime?.getAsyncBoundary(rangeAnchor[2]!);
						return rangeAnchor[3] === 'end' ? record?.endAnchor : record?.startAnchor;
					}
					return runtime?.getElement(String(locator));
				},
			});
		});
	const { createResumeRuntime } = await import('./resume.ts');
	runtime = createResumeRuntime({
		root: input.root,
		graph,
		state: decoded.state,
		view: decoded.view,
		loadSymbol: input.loadSymbol,
		createVisibilityObserver: input.createVisibilityObserver,
		createRemovalObserver: input.createRemovalObserver,
		applyDomJournal,
		renderBranchHtml: input.renderBranchHtml,
	});
	await runtime.start();
	(input.root as ResumeDomElement & { __asyncResumeRuntimeStarted?: boolean })
		.__asyncResumeRuntimeStarted = true;

	const result = { decoded, graph, runtime };
	resumedPayloadContainers.set(input.root, result);
	return result;
}

export function disposeResumedPayload(root: ResumeDomElement): void {
	const resumed = resumedPayloadContainers.get(root);
	resumed?.runtime.dispose();
	resumedPayloadContainers.delete(root);
	delete (root as ResumeDomElement & { __asyncResumeRuntimeStarted?: boolean })
		.__asyncResumeRuntimeStarted;
}

export async function resumeFromPayloadDocument(
	input: ResumePayloadDocumentInput,
): Promise<ResumePayloadScriptsResult> {
	const resumed = alreadyResumedPayload(input.root);
	if (resumed) return resumed;

	const scripts = readPayloadScriptsFromDocument(input.document);
	return resumeFromPayloadScripts({
		...scripts,
		root: input.root,
		loadSymbol: input.loadSymbol,
		createVisibilityObserver: input.createVisibilityObserver,
		createRemovalObserver: input.createRemovalObserver,
		applyDomJournal: input.applyDomJournal,
		renderBranchHtml: input.renderBranchHtml ?? documentTemplateBranchHtml(input.document),
	});
}

function asyncComputedFromPayload(
	input: Parameters<typeof createRuntimeGraphFromResumePayload>[0],
	graphRef: () => RuntimeGraph,
): Promise<NonNullable<Parameters<RuntimeModule['createRuntimeGraph']>[0]['asyncComputed']>> {
	const runnerSymbols = asyncRunnerSymbolsByGraphNode(input.view);
	return Promise.all(input.state.computed.flatMap(async (computed) => {
		if (computed.async !== true) return [];
		const runnerSymbolId = runnerSymbols.get(computed.graphNodeId);
		if (!runnerSymbolId) return [];
		const dependencies = computed.dependencies ?? [];
		return [{
			graphNodeId: computed.graphNodeId,
			dependencies,
			initialSnapshot: computed.snapshot
				? await deserializeAsyncComputedSnapshot(computed.snapshot)
				: undefined,
			key: (read: RuntimeGraphRead) => dependencyKey(dependencies, read),
			run: async ({ key, signal, read }) => {
				const symbol = await input.loadSymbol(runnerSymbolId);
				return await symbol({
					graph: graphRef(),
					read,
					key,
					signal,
					element: input.root,
					getElementHandle: () => undefined,
				});
			},
		}];
	})).then((entries) => entries.flat());
}

async function deserializeAsyncComputedSnapshot(
	snapshot: NonNullable<ProtocolStatePayload['computed'][number]['snapshot']>,
) {
	if (snapshot.status === 'idle') return snapshot;
	const key = await deserializeGraphValue(snapshot.key as SerializedGraphPayload);
	if (snapshot.status === 'pending') {
		return { status: snapshot.status, version: snapshot.version, key };
	}
	if (snapshot.status === 'fulfilled') {
		return {
			status: snapshot.status,
			version: snapshot.version,
			key,
			value: await deserializeGraphValue(snapshot.value as SerializedGraphPayload),
		};
	}
	return {
		status: snapshot.status,
		version: snapshot.version,
		key,
		error: await deserializeGraphValue(snapshot.error as SerializedGraphPayload),
	};
}

function asyncRunnerSymbolsByGraphNode(view: ProtocolViewPayload): Map<string, string> {
	const symbols = new Map<string, string>();
	for (const boundary of view.asyncBoundaries) {
		for (const read of boundary.asyncReads) {
			if (read.runnerSymbolId && !symbols.has(read.graphNodeId)) {
				symbols.set(read.graphNodeId, read.runnerSymbolId);
			}
		}
	}
	return symbols;
}

function dependencyKey(
	dependencies: NonNullable<ProtocolStatePayload['computed'][number]['dependencies']>,
	read: RuntimeGraphRead,
): unknown {
	if (dependencies.length === 0) return undefined;
	if (dependencies.length === 1) {
		const dependency = dependencies[0];
		return read(dependency.graphNodeId, dependency.path);
	}
	return dependencies.map((dependency) => read(dependency.graphNodeId, dependency.path));
}

function alreadyResumedPayload(root: ResumeDomElement): ResumePayloadScriptsResult | undefined {
	const resumed = resumedPayloadContainers.get(root);
	return resumed ? { ...resumed, warnings: [alreadyResumedWarning()] } : undefined;
}

function alreadyResumedWarning(): ResumeAlreadyResumedWarning {
	return {
		code: 'MARKLESS_RESUME_ALREADY_RESUMED',
		severity: 'warning',
		phase: 'resume',
		title: 'This container was already resumed',
		message: 'resumeFromPayloadDocument was called again on an already live container.',
		why: 'Resume attaches graph and event wiring once per payload container.',
		suggestions: [{ message: 'Resume each served container once, or dispose before resuming again.' }],
		docsUrl: 'https://markless.dev/errors/MARKLESS_RESUME_ALREADY_RESUMED',
	};
}

export function readPayloadScriptsFromDocument(
	document: PayloadScriptDocument,
): EncodedPayloadScripts {
	return {
		stateScript: readPayloadScriptFromDocument(document, 'markless/state'),
		viewScript: readPayloadScriptFromDocument(document, 'markless/view'),
	};
}

export function decodePayloadScriptsFromDocument(
	document: PayloadScriptDocument,
): DecodedPayloadScripts {
	return decodePayloadScripts(readPayloadScriptsFromDocument(document));
}

function readPayloadScriptFromDocument(
	document: PayloadScriptDocument,
	type: RuntimePayloadType,
): string {
	const selector = `script[type="${type}"]`;
	const element = document.querySelector(selector);
	if (!element) {
		throw new RuntimePayloadError({
			code: 'MARKLESS_PAYLOAD_INVALID',
			severity: 'error',
			phase: 'payload',
			title: 'Invalid Markless payload',
			payloadType: type,
			payloadScript: '',
			message: `Missing ${type} payload script.`,
			why: `Browser resume requires the ${selector} script to exist before decoding.`,
			suggestions: [{ message: `Include a ${selector} script in the rendered document.` }],
			docsUrl: 'https://markless.dev/errors/MARKLESS_PAYLOAD_INVALID',
		});
	}

	const text = element.textContent ?? element.text ?? element.innerHTML;
	if (text == null) {
		throw new RuntimePayloadError({
			code: 'MARKLESS_PAYLOAD_INVALID',
			severity: 'error',
			phase: 'payload',
			title: 'Invalid Markless payload',
			payloadType: type,
			payloadScript: '',
			message: `Missing ${type} payload script content.`,
			why: `Browser resume found ${selector}, but it did not expose text content.`,
			suggestions: [{ message: `Render JSON payload content inside ${selector}.` }],
			docsUrl: 'https://markless.dev/errors/MARKLESS_PAYLOAD_INVALID',
		});
	}

	return `<script type="${type}">${text}</script>`;
}

function runtimeModule(): Promise<RuntimeModule> {
	runtimeModulePromise ??= import('@markless/runtime');
	return runtimeModulePromise;
}

async function deserializeGraphValue(payload: SerializedGraphPayload): Promise<unknown> {
	valueDecoderPromise ??= import('../../serializer/src/value-decode-client.ts');
	const { deserializeGraphValueForClient } = await valueDecoderPromise;
	return deserializeGraphValueForClient(payload);
}

function documentTemplateBranchHtml(
	document: PayloadScriptDocument,
): ResumeRuntimeInput['renderBranchHtml'] {
	const documentLike = document as {
		readonly createElement?: (tagName: string) => {
			innerHTML: string;
			readonly content?: { readonly childNodes?: ArrayLike<unknown> };
		};
		readonly ownerDocument?: {
			readonly createElement?: (tagName: string) => {
				innerHTML: string;
				readonly content?: { readonly childNodes?: ArrayLike<unknown> };
			};
		};
	};
	const host = documentLike.createElement ? documentLike : documentLike.ownerDocument;
	if (!host?.createElement) return undefined;
	return (html) => {
		const template = host.createElement!('template');
		template.innerHTML = html;
		return Array.from(template.content?.childNodes ?? []) as ReturnType<
			NonNullable<ResumeRuntimeInput['renderBranchHtml']>
		>;
	};
}
