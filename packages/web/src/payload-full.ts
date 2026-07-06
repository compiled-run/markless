import {
	decodePayloadScripts as decodePayloadScriptsClient,
	type DecodedPayloadScripts,
	type EncodedPayloadScripts,
	RuntimePayloadError,
	type RuntimePayloadDiagnostic,
	type RuntimePayloadErrorCode,
	type RuntimePayloadType,
} from '../../serializer/src/protocol-client.ts';
import type { ResumeDomElement, ResumeRuntime, ResumeRuntimeInput } from './resume.ts';
import type { ResumePayloadGraphInput } from './payload-graph-construct.ts';

export {
	RuntimePayloadError,
	type RuntimePayloadDiagnostic,
	type RuntimePayloadErrorCode,
	type RuntimePayloadType,
};
type DevProtocolValidationModule = typeof import('../../serializer/src/protocol-validation.ts');
export type PayloadScriptElement = {
	readonly textContent?: string | null;
	readonly text?: string | null;
	readonly innerHTML?: string | null;
};
export type PayloadScriptDocument = {
	readonly querySelector: (selector: string) => PayloadScriptElement | null;
};
type RuntimeGraph = import('@markless/runtime').RuntimeGraph;

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
let devPayloadValidator: DevProtocolValidationModule['decodePayloadScripts'] | undefined;

declare global {
	interface ImportMeta {
		readonly env: { readonly DEV?: boolean };
	}
}

if (import.meta.env?.DEV) {
	const { decodePayloadScripts: decodePayloadScriptsDev } = await import(
		'../../serializer/src/protocol-validation.ts'
	);
	devPayloadValidator = decodePayloadScriptsDev;
}

export function decodePayloadScripts(input: EncodedPayloadScripts): DecodedPayloadScripts {
	try {
		devPayloadValidator?.(input);
	} catch (error) {
		throw normalizeRuntimePayloadError(error);
	}
	return decodePayloadScriptsClient(input);
}

function normalizeRuntimePayloadError(error: unknown): Error {
	if (
		error &&
		typeof error === 'object' &&
		'code' in error &&
		'payloadType' in error &&
		'payloadScript' in error
	) {
		return new RuntimePayloadError(error as RuntimePayloadDiagnostic);
	}
	return error instanceof Error ? error : new Error(String(error));
}

export async function createRuntimeGraphFromStatePayload(
	payload: ResumePayloadGraphInput['state'],
): Promise<RuntimeGraph> {
	const graph = await import('./payload-graph-construct.ts');
	return graph.createRuntimeGraphFromStatePayload(payload);
}

export async function createRuntimeGraphFromResumePayload(
	input: ResumePayloadGraphInput,
): Promise<RuntimeGraph> {
	const graph = await import('./payload-graph-construct.ts');
	return graph.createRuntimeGraphFromResumePayload(input);
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
