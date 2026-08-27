import type {
	EventOnlyResumeContainer,
	ResumeEventOnlyFromPayloadDocumentInput,
} from './event-only-lean/types.ts';

export type {
	EventOnlyResumeBehaviorCleanup,
	EventOnlyResumeBehaviorRecord,
	EventOnlyResumeContainer,
	EventOnlyResumeDomElement,
	EventOnlyResumeDomEvent,
	EventOnlyResumeDomNode,
	EventOnlyResumeDomUpdateRecord,
	EventOnlyResumeGraph,
	EventOnlyResumePayloadDocument,
	EventOnlyResumePayloadScriptElement,
	EventOnlyResumeRecord,
	EventOnlyResumeSymbol,
	EventOnlyResumeSymbolContext,
	ResumeEventOnlyFromPayloadDocumentInput,
} from './event-only-lean/types.ts';

export async function resumeEventOnlyFromPayloadDocument(
	input: ResumeEventOnlyFromPayloadDocumentInput,
): Promise<EventOnlyResumeContainer> {
	const mode = leanResumeMode(input.runtimeDemandMap);
	if (mode === 'scalar' || (mode === 'mixed' && input.eventRecord)) {
		const { resumeScalarCoreEventFromPayloadDocument } =
			await import('./event-only-lean/scalar-core.ts');
		return resumeScalarCoreEventFromPayloadDocument(input);
	}
	if (mode === 'row' || mode === 'mixed') {
		const { resumeScalarRowEventFromPayloadDocument } =
			await import('./event-only-lean/row.ts');
		return resumeScalarRowEventFromPayloadDocument(input);
	}
	return resumeFullEventOnly(input);
}

async function resumeFullEventOnly(
	input: ResumeEventOnlyFromPayloadDocumentInput,
): Promise<EventOnlyResumeContainer> {
	if (input.loadFullResume) {
		await input.loadFullResume(input);
		return undefined as unknown as EventOnlyResumeContainer;
	}
	input.root.__asyncResumeRuntimeStarted = true;
	const { resumeFromPayloadDocument } = await import('./payload.ts');
	const { runtime } = await resumeFromPayloadDocument({
		document: input.document,
		root: input.root,
		loadSymbol: input.loadSymbol,
	});
	await runtime.dispatch(input.event, {
		syncPolicyAlreadyApplied: input.syncPolicyAlreadyApplied === true,
		// A record-less forward is the entry capture's broad sweep, which the live
		// listener passes through; a forward that DID name a record and matches
		// nothing here is the routing defect the refusal exists for.
		ignoreUnmatched: input.eventRecord == null,
	});
	return undefined as unknown as EventOnlyResumeContainer;
}

type LeanResumeMode = 'none' | 'scalar' | 'row' | 'mixed';

function leanResumeMode(runtimeDemandMap: unknown): LeanResumeMode {
	const recordKinds = (
		runtimeDemandMap as
			| {
					readonly recordKinds?: ReadonlyArray<{
						readonly kind: string;
						readonly replaced: boolean;
					}>;
			  }
			| undefined
	)?.recordKinds;
	if (!recordKinds) return 'none';
	const replaced = new Map(recordKinds.map((record) => [record.kind, record.replaced]));
	const scalar = replaced.get('event') === true && replaced.get('dom-update') === true;
	const row = replaced.get('keyed-repeat') === true && replaced.get('dom-update') === true;
	if (scalar && row) return 'mixed';
	if (scalar) return 'scalar';
	if (row) return 'row';
	return 'none';
}
