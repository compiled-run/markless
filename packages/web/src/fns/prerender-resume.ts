import type { DecodedPayloadScripts } from '../../../serializer/src/protocol-client-storage.ts';
import { decodePayloadScripts } from '../../../serializer/src/protocol-client-storage.ts';
import {
	mergeResumeRecordDelta,
	type ResumeRecordSet,
} from '@markless/serializer/resume-record-delta';
import type { ResumePayloadScriptsInput } from '../payload-full.ts';
import {
	documentTemplateBranchHtml,
	readPayloadScriptsFromDocument,
	type PayloadScriptDocument,
} from '../payload-document-common.ts';
import { resumeFromPrerenderRecordsImpl } from '../payload-resume.ts';
import {
	derivePrerenderResumeRecords,
	renderPrerenderBoundary,
} from '../prerender/evaluator.ts';

export { derivePrerenderResumeRecords, renderPrerenderBoundary };

export function mergePrerenderPayloadRecords(
	derived: ResumeRecordSet,
	document: PayloadScriptDocument,
): ResumeRecordSet {
	const stateScript = document.querySelector('script[type="markless/state"]');
	const viewScript = document.querySelector('script[type="markless/view"]');
	if (!stateScript && !viewScript) return derived;
	const payload = decodePayloadScripts(readPayloadScriptsFromDocument(document));
	return mergeResumeRecordDelta(derived, payload);
}

// Wake-only twin of payload-resume's adoptStreamedPatchesIfPresent: streamed
// settles leave arm/state-patch scripts in the document, and the wake must
// adopt them before resuming. Living here keeps the shared resume chunk
// byte-identical for gated (channel-off) production builds.
async function adoptStreamedForWake<
	T extends DecodedPayloadScripts & { readonly root: ResumePayloadScriptsInput['root'] },
>(input: T): Promise<T> {
	const documentHost = (
		input.root as {
			readonly ownerDocument?: { readonly querySelector?: (selector: string) => unknown };
		}
	).ownerDocument;
	if (
		!documentHost?.querySelector?.(
			'script[type="markless/arm"],script[type="markless/state-patch"]',
		)
	) {
		return input;
	}
	const { adoptStreamedArmPatches } = await import('../resume-stream-patches.ts');
	return { ...input, ...(await adoptStreamedArmPatches(input, input.root)) };
}

export async function resumeFromPrerenderRecords(
	input: Omit<ResumePayloadScriptsInput, 'stateScript' | 'viewScript'> & DecodedPayloadScripts,
) {
	const adopted = await adoptStreamedForWake({
		...input,
		renderBranchHtml: input.renderBranchHtml ?? documentTemplateBranchHtml(input.root),
	});
	return resumeFromPrerenderRecordsImpl(adopted);
}
