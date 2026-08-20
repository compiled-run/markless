import type { ResumeRuntimeErrorContext } from './resume-types.ts';

type ReportableError = Error & Record<string, unknown>;

// A container-level listener knows the event and the element it fired on but no
// host node, so it reports through this wider context than a routed dispatch.
export type RuntimeErrorReportContext =
	| ResumeRuntimeErrorContext
	| {
			readonly phase: 'event';
			readonly eventName: string;
			readonly selector?: string;
			readonly symbolId?: string;
	  };

export function enrichRuntimeErrorForReporting(
	error: unknown,
	context: RuntimeErrorReportContext,
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
	const graphNodeId = (context as { readonly graphNodeId?: unknown }).graphNodeId;
	if (typeof graphNodeId === 'string') reportable.graphNodeId ??= graphNodeId;
	const selector = (context as { readonly selector?: unknown }).selector;
	if (typeof selector === 'string') reportable.selector ??= selector;
	if (context.symbolId) reportable.symbolId ??= context.symbolId;
	return reportable;
}

// Outer containment boundaries re-report whatever they catch; this flag keeps a
// failure the dispatch layer already surfaced from reaching the surface twice.
const RUNTIME_ERROR_REPORTED = '__marklessRuntimeErrorReported';

export function markRuntimeErrorReported(error: ReportableError): void {
	error[RUNTIME_ERROR_REPORTED] = true;
}

export function reportRuntimeErrorToHost(
	error: unknown,
	context: RuntimeErrorReportContext,
): void {
	const reportable = enrichRuntimeErrorForReporting(error, context);
	if (reportable[RUNTIME_ERROR_REPORTED]) return;
	markRuntimeErrorReported(reportable);
	const host = globalThis as {
		readonly reportError?: (error: unknown) => void;
		readonly dispatchEvent?: (event: Event) => boolean;
		readonly ErrorEvent?: new (
			type: string,
			init: { readonly error: unknown; readonly message: string },
		) => Event;
	};
	if (host.reportError) return host.reportError(reportable);
	if (host.dispatchEvent && host.ErrorEvent)
		host.dispatchEvent(
			new host.ErrorEvent('error', { error: reportable, message: reportable.message }),
		);
}
