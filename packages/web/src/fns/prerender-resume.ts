import type { DecodedPayloadScripts } from '../../../serializer/src/protocol-client-storage.ts';
import { decodePayloadScripts } from '../../../serializer/src/protocol-client-storage.ts';
import {
	mergeResumeRecordDelta,
	type ResumeRecordSet,
} from '@markless/serializer/resume-record-merge';
import type { ResumePayloadScriptsInput } from '../payload-full.ts';
import {
	documentTemplateBranchHtml,
	readPayloadScriptsFromDocument,
	type PayloadScriptDocument,
} from '../payload-document-common.ts';
import { resumeFromPrerenderRecordsImpl } from '../payload-resume.ts';
import { wakeNoopResume } from '../payload-resume-registry.ts';
import { serializeRuntimeAsyncSnapshots } from '@markless/serializer';
import { adoptFilledArms } from '../prerender/adopt-filled-arms.ts';
import { isSettleKernelUnsupported, renderSettledArm } from '../settle-kernel.ts';
import { branchOwnerPlacement } from '../prerender/owner-placement.ts';

// The full prerender evaluator re-evaluates the ENTIRE render-data surface to
// obtain one boundary arm, and a static import of it here is what drags that
// chunk into the load window. It now loads only where it is actually needed:
// record derivation, and the settle fallback the kernel refuses.
async function loadPrerenderEvaluator() {
	return import('../prerender/evaluator.ts');
}

export async function derivePrerenderResumeRecords(
	page: unknown,
	propsOrLoadSymbol?: unknown,
): Promise<ReturnType<Awaited<ReturnType<typeof loadPrerenderEvaluator>>['derivePrerenderResumeRecords']>> {
	const evaluator = await loadPrerenderEvaluator();
	return evaluator.derivePrerenderResumeRecords(page as never, propsOrLoadSymbol);
}

function isPrerenderDataSurface(value: unknown): boolean {
	return !!value && typeof value === 'object' && 'renderData' in value && 'components' in value;
}

// No settle-kernel shortcut here: the whole point of a branch escalation is
// that the arm holds a component the kernel cannot express without running it.
export async function renderPrerenderBranch(
	page: unknown,
	branchSiteId: string,
	graph: { readonly read: (graphNodeId: string, path?: ReadonlyArray<string>) => unknown },
	propsOrLoadSymbol?: unknown,
	pageBranchId?: string,
) {
	const evaluator = await loadPrerenderEvaluator();
	return evaluator.renderPrerenderBranch(
		page as never,
		branchSiteId,
		graph as never,
		propsOrLoadSymbol,
		pageBranchId,
	);
}

export async function renderPrerenderBoundary(
	page: unknown,
	boundaryId: string,
	status: 'fulfilled' | 'rejected',
	graph: { readonly read: (graphNodeId: string, path?: ReadonlyArray<string>) => unknown },
	propsOrLoadSymbol?: unknown,
	pageBoundaryId?: string,
	// The whole render data, when `page` is the served subset only the kernel reads.
	wholePage?: () => Promise<unknown>,
) {
	if (isPrerenderDataSurface(page)) {
		try {
			const kernel = renderSettledArm({
				surface: page as never,
				boundaryId,
				status,
				read: (graphNodeId, path = []) => graph.read(graphNodeId, path),
				serializeComputed: serializeRuntimeAsyncSnapshots as never,
				// Only the boundary's own update symbol re-spells a placed owner's computeds and bound ids.
				...(pageBoundaryId && {
					placement: (owner: string) => branchOwnerPlacement(page as never, owner, graph as never),
				}),
			});
			return {
				html: kernel.html,
				armRecords: kernel.armRecords as never,
				computed: kernel.computed as never,
				...(kernel.moduleRootPath !== undefined && { moduleRootPath: kernel.moduleRootPath }),
			};
		} catch (error) {
			// Fail closed: anything the kernel cannot express exactly falls back to
			// the full evaluation rather than committing a half-rendered arm.
			if (!isSettleKernelUnsupported(error)) throw error;
		}
	}
	const evaluator = await loadPrerenderEvaluator();
	return evaluator.renderPrerenderBoundary(
		(wholePage ? await wholePage() : page) as never,
		boundaryId,
		status,
		graph as never,
		propsOrLoadSymbol,
		pageBoundaryId,
	);
}

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
>(input: T, life: unknown): Promise<T> {
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
		(input.root as { __mAdopted?: boolean }).__mAdopted = true;
		return input;
	}
	const { adoptStreamedArmPatches } = await import('../resume-stream-patches.ts');
	return { ...input, ...(await adoptStreamedArmPatches(input, input.root, life)) };
}

const pageLifetime = (root: object): unknown => (root as { readonly __mL?: object }).__mL;

export async function resumeFromPrerenderRecords(
	input: Omit<ResumePayloadScriptsInput, 'stateScript' | 'viewScript'> & DecodedPayloadScripts,
) {
	const life = pageLifetime(input.root);
	const adopted = await adoptStreamedForWake(
		{
			...input,
			renderBranchHtml: input.renderBranchHtml ?? documentTemplateBranchHtml(input.root),
		},
		life,
	);
	const filled = await adoptFilledArms(
		adopted,
		adopted.root as never,
		adopted.renderAsyncBoundary as never,
	);
	if (pageLifetime(input.root) !== life) return wakeNoopResume;
	return resumeFromPrerenderRecordsImpl(filled);
}
