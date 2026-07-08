import type { ResumeRuntimeErrorContext } from './resume-types.ts';

type ReportableError = Error & Record<string, unknown>;

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
	const graphNodeId = (context as { readonly graphNodeId?: unknown }).graphNodeId;
	if (typeof graphNodeId === 'string') reportable.graphNodeId ??= graphNodeId;
	if (context.symbolId) reportable.symbolId ??= context.symbolId;
	return reportable;
}
