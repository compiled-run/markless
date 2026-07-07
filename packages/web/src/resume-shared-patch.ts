import type { ResumeDomEvent, ResumeRuntimeInput } from './resume-types.ts';

export function createResumeSharedPatchRuntime(input: {
	readonly root: ResumeRuntimeInput['root'];
	readonly graph: ResumeRuntimeInput['graph'];
}) {
	let fallbackSharedPatchDispatcher: ResumeRuntimeInput['dispatchSharedPatch'];

	async function getSharedPatchDispatcher() {
		if (fallbackSharedPatchDispatcher || !input.root.dispatchEvent) {
			return fallbackSharedPatchDispatcher;
		}
		fallbackSharedPatchDispatcher = (await import('./resume-handoff.ts')).defaultSharedPatchDispatcher(
			input.root,
		);
		return fallbackSharedPatchDispatcher;
	}

	return {
		async dispatchSharedPatch(patch: Parameters<NonNullable<ResumeRuntimeInput['dispatchSharedPatch']>>[0]) {
			const dispatchSharedPatch = await getSharedPatchDispatcher();
			return dispatchSharedPatch?.(patch);
		},
		async receiveSharedPatch(event: ResumeDomEvent): Promise<boolean> {
			const { isResumeSharedPatchEvent } = await import('./resume-handoff.ts');
			return isResumeSharedPatchEvent(event) && input.graph.applySharedPatch(event.detail);
		},
	};
}
