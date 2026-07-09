import type { ResumeRuntimeErrorContext } from './resume-types.ts';

type ReportableError = Error & Record<string, unknown>;

export type RegionRenderErrorInput = {
	readonly regionKind: string;
	readonly regionName: string;
	readonly phase?: 'runtime' | 'resume';
	readonly originalError: unknown;
};

export function enrichRuntimeErrorForReporting(
	error: unknown,
	context: ResumeRuntimeErrorContext,
): ReportableError {
	const reportable =
		error instanceof Error
			? (error as ReportableError)
			: (new Error(String(error)) as ReportableError);
	const code = typeof reportable.code === 'string' ? reportable.code : 'MARKLESS_RUNTIME_ERROR';
	reportable.code = code;
	reportable.severity ??= 'error';
	reportable.phase ??= 'runtime';
	reportable.docsUrl ??= `https://markless.dev/errors/${code}`;
	if ('hostNodeId' in context) reportable.hostNodeId ??= context.hostNodeId;
	if ('eventName' in context) reportable.eventName ??= context.eventName;
	const branchId = (context as { readonly branchId?: unknown }).branchId;
	if (typeof branchId === 'string') reportable.branchId ??= branchId;
	const boundaryId = (context as { readonly boundaryId?: unknown }).boundaryId;
	if (typeof boundaryId === 'string') reportable.boundaryId ??= boundaryId;
	const graphNodeId = (context as { readonly graphNodeId?: unknown }).graphNodeId;
	if (typeof graphNodeId === 'string') reportable.graphNodeId ??= graphNodeId;
	if (context.symbolId) reportable.symbolId ??= context.symbolId;
	return reportable;
}

export function createRegionRenderError(input: RegionRenderErrorInput): ReportableError {
	const original = input.originalError instanceof Error
		? input.originalError.message
		: String(input.originalError);
	const message = `MARKLESS_REGION_RENDER_ERROR: ${input.regionKind} "${input.regionName}" failed while rendering: ${original}`;
	return Object.assign(new Error(message), {
		code: 'MARKLESS_REGION_RENDER_ERROR',
		severity: 'error',
		phase: input.phase ?? 'runtime',
		regionKind: input.regionKind,
		regionName: input.regionName,
		cause: input.originalError,
		docsUrl: 'https://markless.dev/errors/MARKLESS_REGION_RENDER_ERROR',
	} satisfies Record<string, unknown>) as ReportableError;
}

export function reportGlobalRuntimeError(error: unknown): void {
	const host = globalThis as {
		readonly reportError?: (error: unknown) => void;
		readonly dispatchEvent?: (event: Event) => boolean;
		readonly ErrorEvent?: new (type: string, init: { error: unknown; message: string }) => Event;
		readonly console?: { readonly error?: (...args: unknown[]) => void };
	};
	if (host.reportError) return host.reportError(error);
	if (host.dispatchEvent && host.ErrorEvent) {
		const message = error instanceof Error ? error.message : String(error);
		host.dispatchEvent(new host.ErrorEvent('error', { error, message }));
		return;
	}
	host.console?.error?.(error);
}
