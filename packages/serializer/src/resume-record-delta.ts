import type { ProtocolStatePayload, ProtocolViewPayload } from './protocol.ts';
import { serializeGraphValue } from './value.ts';

export type ResumeRecordSet = {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
};

export type ResumeRecordDeltaClassification =
	| { readonly kind: 'empty' }
	| { readonly kind: 'divergent' };

// Cells, computed snapshots, and props are all protocol records here. Comparing
// the complete durable value keeps one rule for every record kind and guards
// view/record parity before SSR chooses a payload-free container.
export function classifyResumeRecordDelta(
	baseline: ResumeRecordSet,
	request: ResumeRecordSet,
): ResumeRecordDeltaClassification {
	const baselineValue = durableComparisonValue(baseline, 'build baseline');
	const requestValue = durableComparisonValue(request, 'request records');
	return baselineValue === requestValue ? { kind: 'empty' } : { kind: 'divergent' };
}

function durableComparisonValue(records: ResumeRecordSet, source: string): string {
	const result = serializeGraphValue(records);
	if (!result.ok) {
		const diagnostic = result.diagnostics[0];
		throw new Error(
			`MARKLESS_RESUME_RECORD_DIVERGENCE_UNSERIALIZABLE: ${source} contains ` +
				`${diagnostic?.valueKind ?? 'unsupported'} at ${diagnostic?.statePath ?? '<root>'}.`,
		);
	}
	return JSON.stringify(result.payload);
}
