// Static edge: full-tier resume always constructs the browser resume runtime;
// the demand map co-demands web/resume with web/payload-resume on every tier
// that loads this module. The chunk groups keep resume core in its own chunk.
import { createResumeRuntime, type ResumeRuntime } from './resume.ts';
import {
	createRuntimeGraphFromResumePayload,
	decodePayloadScripts,
	type ResumePayloadScriptsInput,
	type ResumePayloadScriptsResult,
} from './payload-full.ts';
import {
	getAlreadyResumedPayload,
	setResumedPayload,
	startResumedPayload,
} from './payload-resume-registry.ts';

// Streamed settles (T107) leave records + snapshot patches in the document.
// Only pages that actually streamed pay for the adoption module: the check
// is one selector; the overlay chunk loads on demand.
async function adoptStreamedPatchesIfPresent(
	decoded: ReturnType<typeof decodePayloadScripts>,
	root: ResumePayloadScriptsInput['root'],
): Promise<ReturnType<typeof decodePayloadScripts>> {
	const documentHost = (
		root as {
			readonly ownerDocument?: { readonly querySelector?: (selector: string) => unknown };
		}
	).ownerDocument;
	if (
		!documentHost?.querySelector?.(
			'script[type="markless/arm"],script[type="markless/state-patch"]',
		)
	) {
		return decoded;
	}
	const { adoptStreamedArmPatches } = await import('./resume-stream-patches.ts');
	return adoptStreamedArmPatches(decoded, root);
}

export async function resumeFromPayloadScriptsImpl(
	input: ResumePayloadScriptsInput,
): Promise<ResumePayloadScriptsResult> {
	const resumed = getAlreadyResumedPayload(input.root);
	if (resumed) return resumed;
	return startResumedPayload(input.root, () => startPayloadResume(input));
}

async function startPayloadResume(
	input: ResumePayloadScriptsInput,
): Promise<ResumePayloadScriptsResult> {
	// Streamed settles left records + snapshot patches in the document; adopt
	// them before graph construction so the settled DOM resumes interactive.
	const decoded = await adoptStreamedPatchesIfPresent(decodePayloadScripts(input), input.root);
	const graph = await createRuntimeGraphFromResumePayload({
		state: decoded.state,
		view: decoded.view,
		root: input.root,
		loadSymbol: input.loadSymbol,
	});
	delete input.root.__marklessEventOnlyGraph;
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
	(
		input.root as typeof input.root & { __asyncResumeRuntimeStarted?: boolean }
	).__asyncResumeRuntimeStarted = true;

	const result = { decoded, graph, runtime };
	setResumedPayload(input.root, result);
	return result;
}
