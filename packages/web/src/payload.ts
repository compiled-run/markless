import {
	decodePayloadScripts,
	deserializeGraphValue,
	payloadInvalidError,
	payloadScriptSelector,
	type DecodedPayloadScripts,
	type EncodedPayloadScripts,
	type ProtocolStatePayload,
	type ProtocolViewPayload,
	type RuntimePayloadType,
	type SerializedGraphPayload,
} from '@markless/serializer';
export {
	decodePayloadScripts,
	RuntimePayloadError,
	type RuntimePayloadDiagnostic,
	type RuntimePayloadErrorCode,
	type RuntimePayloadType,
} from '@markless/serializer';
import { applyDomJournalEntries } from './dom-journal.ts';
import { createRuntimeGraph, type RuntimeGraph, type RuntimeGraphRead } from '@markless/runtime';
import {
	createResumeRuntime,
	type ResumeDomElement,
	type ResumeRuntime,
	type ResumeRuntimeInput,
} from './resume.ts';

export type PayloadScriptElement = {
	readonly textContent?: string | null;
	readonly text?: string | null;
	readonly innerHTML?: string | null;
};

export type PayloadScriptDocument = {
	readonly querySelector: (selector: string) => PayloadScriptElement | null;
};

export type ResumePayloadScriptsInput = EncodedPayloadScripts & {
	readonly root: ResumeDomElement;
	readonly loadSymbol: ResumeRuntimeInput['loadSymbol'];
	readonly createVisibilityObserver?: ResumeRuntimeInput['createVisibilityObserver'];
	readonly createRemovalObserver?: ResumeRuntimeInput['createRemovalObserver'];
	readonly applyDomJournal?: ResumeRuntimeInput['applyDomJournal'];
	readonly renderBranchHtml?: ResumeRuntimeInput['renderBranchHtml'];
};

export type ResumePayloadDocumentInput = Omit<
	ResumePayloadScriptsInput,
	'stateScript' | 'viewScript'
> & {
	readonly document: PayloadScriptDocument;
};

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

export function createRuntimeGraphFromStatePayload(payload: ProtocolStatePayload): RuntimeGraph {
	return createRuntimeGraph({
		cells: payload.cells.map((cell) => ({
			graphNodeId: cell.graphNodeId,
			value:
				cell.value === undefined
					? undefined
					: deserializeGraphValue(cell.value as SerializedGraphPayload),
		})),
		sharedDefinitions: payload.sharedDefinitions,
	});
}

// Builds the resume/CSR runtime graph: payload cells plus async computed
// nodes whose runners load through the generated symbol resolver.
export function createRuntimeGraphFromResumePayload(input: {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
	readonly root: ResumeDomElement;
	readonly loadSymbol: ResumeRuntimeInput['loadSymbol'];
}): RuntimeGraph {
	let graph!: RuntimeGraph;
	graph = createRuntimeGraph({
		cells: input.state.cells.map((cell) => ({
			graphNodeId: cell.graphNodeId,
			value:
				cell.value === undefined
					? undefined
					: deserializeGraphValue(cell.value as SerializedGraphPayload),
		})),
		sharedDefinitions: input.state.sharedDefinitions,
		asyncComputed: asyncComputedFromPayload(input, () => graph),
	});

	return graph;
}

function asyncComputedFromPayload(
	input: {
		readonly state: ProtocolStatePayload;
		readonly view: ProtocolViewPayload;
		readonly root: ResumeDomElement;
		readonly loadSymbol: ResumeRuntimeInput['loadSymbol'];
	},
	graphRef: () => RuntimeGraph,
) {
	const runnerSymbols = asyncRunnerSymbolsByGraphNode(input.view);

	return input.state.computed.flatMap((computed) => {
		if (computed.async !== true) return [];

		const runnerSymbolId = runnerSymbols.get(computed.graphNodeId);
		if (!runnerSymbolId) return [];

		const dependencies = computed.dependencies ?? [];
		return [
			{
				graphNodeId: computed.graphNodeId,
				dependencies,
				initialSnapshot: computed.snapshot
					? deserializeAsyncComputedSnapshot(computed.snapshot)
					: undefined,
				key: (read: RuntimeGraphRead) => dependencyKey(dependencies, read),
				run: async ({
					key,
					signal,
					read,
				}: {
					readonly key: unknown;
					readonly signal: AbortSignal;
					readonly read: RuntimeGraphRead;
				}) => {
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
			},
		];
	});
}

function deserializeAsyncComputedSnapshot(
	snapshot: NonNullable<ProtocolStatePayload['computed'][number]['snapshot']>,
) {
	if (snapshot.status === 'idle') return snapshot;

	const key = deserializeGraphValue(snapshot.key as SerializedGraphPayload);
	if (snapshot.status === 'pending') {
		return {
			status: snapshot.status,
			version: snapshot.version,
			key,
		};
	}

	if (snapshot.status === 'fulfilled') {
		return {
			status: snapshot.status,
			version: snapshot.version,
			key,
			value: deserializeGraphValue(snapshot.value as SerializedGraphPayload),
		};
	}

	return {
		status: snapshot.status,
		version: snapshot.version,
		key,
		error: deserializeGraphValue(snapshot.error as SerializedGraphPayload),
	};
}

function asyncRunnerSymbolsByGraphNode(view: ProtocolViewPayload): Map<string, string> {
	const symbols = new Map<string, string>();

	for (const boundary of view.asyncBoundaries) {
		for (const read of boundary.asyncReads) {
			if (!read.runnerSymbolId || symbols.has(read.graphNodeId)) continue;

			symbols.set(read.graphNodeId, read.runnerSymbolId);
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

export async function resumeFromPayloadScripts(
	input: ResumePayloadScriptsInput,
): Promise<ResumePayloadScriptsResult> {
	const resumed = alreadyResumedPayload(input.root);
	if (resumed) return resumed;

	const decoded = decodePayloadScripts(input);
	const graph = createRuntimeGraphFromResumePayload({
		state: decoded.state,
		view: decoded.view,
		root: input.root,
		loadSymbol: input.loadSymbol,
	});
	let runtime: ResumeRuntime | undefined;
	const applyDomJournal =
		input.applyDomJournal ??
		((entries) =>
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
			}));
	runtime = createResumeRuntime({
		root: input.root,
		graph,
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

	const result = {
		decoded,
		graph,
		runtime,
	};
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

function alreadyResumedPayload(root: ResumeDomElement): ResumePayloadScriptsResult | undefined {
	const resumed = resumedPayloadContainers.get(root);
	if (!resumed) return undefined;

	return {
		...resumed,
		warnings: [alreadyResumedWarning()],
	};
}

function alreadyResumedWarning(): ResumeAlreadyResumedWarning {
	return {
		code: 'MARKLESS_RESUME_ALREADY_RESUMED',
		severity: 'warning',
		phase: 'resume',
		title: 'This container was already resumed',
		message:
			'resumeFromPayloadDocument was called again on a container that already has a live resume runtime. A second runtime would dispatch every event twice.',
		why: 'Resume attaches the container event wiring and graph once; a container has exactly one resume runtime for its payload.',
		suggestions: [
			{
				message:
					'Resume each served container once from one entry point; dispose the previous runtime before intentionally resuming again.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_RESUME_ALREADY_RESUMED',
	};
}

// Browser default for branch flip fragments: parse the rebuilt arm HTML
// through a <template> owned by the payload document. Hosts without
// createElement (bare script decoders in tests) simply provide no default.
function documentTemplateBranchHtml(
	document: PayloadScriptDocument,
): ResumeRuntimeInput['renderBranchHtml'] {
	// The "document" may be a container element (payload scripts live inside
	// it); fall back to its ownerDocument for element creation.
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
	const host =
		typeof documentLike.createElement === 'function'
			? documentLike
			: typeof documentLike.ownerDocument?.createElement === 'function'
				? documentLike.ownerDocument
				: undefined;
	const createElement = host?.createElement;
	if (!host || typeof createElement !== 'function') return undefined;
	return (html) => {
		const template = createElement.call(host, 'template');
		template.innerHTML = html;
		// Snapshot: insertion moves live childNodes out of the template.
		return Array.from(template.content?.childNodes ?? []) as ReturnType<
			NonNullable<ResumeRuntimeInput['renderBranchHtml']>
		>;
	};
}

function readPayloadScriptFromDocument(
	document: PayloadScriptDocument,
	type: RuntimePayloadType,
): string {
	const element = document.querySelector(`script[type="${type}"]`);
	if (!element) {
		throw payloadInvalidError(
			type,
			`Missing ${type} payload script.`,
			`Browser resume requires the ${payloadScriptSelector(type)} script to exist before the runtime can decode the resumability payload.`,
			[
				{
					message: `Include a ${payloadScriptSelector(type)} script in the rendered document.`,
				},
			],
		);
	}

	const text = element.textContent ?? element.text ?? element.innerHTML;
	if (text == null) {
		throw payloadInvalidError(
			type,
			`Missing ${type} payload script content.`,
			`Browser resume found ${payloadScriptSelector(type)}, but the script did not expose text content for the runtime to decode.`,
			[
				{
					message: `Render JSON payload content inside ${payloadScriptSelector(type)}.`,
				},
			],
		);
	}

	return `<script type="${type}">${text}</script>`;
}
