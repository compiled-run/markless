import type {
	ResumeDomEvent,
	ResumeRuntimeErrorContext,
	ResumeRuntimeInput,
} from './resume-types.ts';
import {
	enrichRuntimeErrorForReporting,
	reportGlobalRuntimeError,
} from './runtime-error-reporting.ts';

export const SHARED_PATCH_EVENT_TYPE = 'async:shared-patch';

type SharedPatchRuntime = ReturnType<
	(typeof import('./resume-shared-patch.ts'))['createResumeSharedPatchRuntime']
>;

export function createResumeRuntimeShared(input: ResumeRuntimeInput) {
	let sharedPatchRuntime: SharedPatchRuntime | undefined;

	const flushRuntimeGraph = async () => {
		try {
			await input.graph.flush();
		} catch (error) {
			await reportRuntimeError(error, { phase: 'runtime' });
			throw error;
		}
		const patches = input.graph.takeSharedPatches?.() ?? [];
		if (patches.length === 0) return;
		const dispatchSharedPatch =
			input.dispatchSharedPatch ?? (await getSharedPatchRuntime()).dispatchSharedPatch;
		if (!dispatchSharedPatch) return;
		for (const patch of patches) {
			const result = dispatchSharedPatch(patch);
			if (isPromiseLike(result)) await result;
		}
	};

	const reportRuntimeError = async (error: unknown, context: ResumeRuntimeErrorContext) => {
		const reportable = enrichRuntimeErrorForReporting(error, context);
		if (!input.onError) {
			reportGlobalRuntimeError(reportable);
			return;
		}
		try {
			const result = input.onError(reportable, context);
			if (isPromiseLike(result)) await result;
		} catch {}
	};

	async function getSharedPatchRuntime(): Promise<SharedPatchRuntime> {
		if (sharedPatchRuntime) return sharedPatchRuntime;
		const { createResumeSharedPatchRuntime } = await import('./resume-shared-patch.ts');
		sharedPatchRuntime = createResumeSharedPatchRuntime({
			root: input.root,
			graph: input.graph,
		});
		return sharedPatchRuntime;
	}

	const receiveSharedPatch = async (event: ResumeDomEvent): Promise<void> => {
		const runtime = await getSharedPatchRuntime();
		if (await runtime.receiveSharedPatch(event)) await flushRuntimeGraph();
	};

	return { flushRuntimeGraph, receiveSharedPatch, reportRuntimeError };
}

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
	return (
		value !== null &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof (value as { readonly then?: unknown }).then === 'function'
	);
}
