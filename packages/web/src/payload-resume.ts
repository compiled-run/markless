import type { ResumeRuntime } from './resume.ts';
import {
	createRuntimeGraphFromResumePayload,
	decodePayloadScripts,
	type ResumePayloadScriptsInput,
	type ResumePayloadScriptsResult,
} from './payload-full.ts';
import { getAlreadyResumedPayload, setResumedPayload } from './payload-resume-registry.ts';

export async function resumeFromPayloadScriptsImpl(
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
	(
		input.root as typeof input.root & { __asyncResumeRuntimeStarted?: boolean }
	).__asyncResumeRuntimeStarted = true;

	const result = { decoded, graph, runtime };
	setResumedPayload(input.root, result);
	return result;
}
