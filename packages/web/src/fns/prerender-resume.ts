import type { DecodedPayloadScripts } from '../../../serializer/src/protocol-client-storage.ts';
import type { ResumePayloadScriptsInput } from '../payload-full.ts';
import { documentTemplateBranchHtml } from '../payload-document-common.ts';
import { resumeFromPrerenderRecordsImpl } from '../payload-resume.ts';
import {
	derivePrerenderResumeRecords,
	renderPrerenderBoundary,
} from '../prerender/evaluator.ts';

export { derivePrerenderResumeRecords, renderPrerenderBoundary };

export function resumeFromPrerenderRecords(
	input: Omit<ResumePayloadScriptsInput, 'stateScript' | 'viewScript'> & DecodedPayloadScripts,
) {
	return resumeFromPrerenderRecordsImpl({
		...input,
		renderBranchHtml: input.renderBranchHtml ?? documentTemplateBranchHtml(input.root),
	});
}
