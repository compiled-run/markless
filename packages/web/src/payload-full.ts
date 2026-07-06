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
import {
	deleteResumedPayload,
	getAlreadyResumedPayload,
	setResumedPayload,
	type ResumeAlreadyResumedWarning,
} from './payload-resume-registry.ts';
export * from './payload-document.ts';

export {
	RuntimePayloadError,
	type RuntimePayloadDiagnostic,
	type RuntimePayloadErrorCode,
	type RuntimePayloadType,
};
type DevProtocolValidationModule = typeof import('../../serializer/src/protocol-validation.ts');
type RuntimeGraph = import('@markless/runtime').RuntimeGraph;

export type ResumePayloadScriptsInput = EncodedPayloadScripts & Pick<
	ResumeRuntimeInput,
	| 'loadSymbol'
	| 'createVisibilityObserver'
	| 'createRemovalObserver'
	| 'applyDomJournal'
	| 'renderBranchHtml'> & { readonly root: ResumeDomElement };

export type ResumePayloadScriptsResult = {
	readonly decoded: DecodedPayloadScripts;
	readonly graph: RuntimeGraph;
	readonly runtime: ResumeRuntime;
	readonly warnings?: ReadonlyArray<ResumeAlreadyResumedWarning>;
};

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
	const resumed = getAlreadyResumedPayload(input.root);
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
	setResumedPayload(input.root, result);
	return result;
}

export function disposeResumedPayload(root: ResumeDomElement): void {
	const resumed = deleteResumedPayload(root);
	resumed?.runtime.dispose();
	delete (root as ResumeDomElement & { __asyncResumeRuntimeStarted?: boolean })
		.__asyncResumeRuntimeStarted;
}
