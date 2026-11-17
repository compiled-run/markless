import type { FlowFailure } from './maestro.ts';
import { PROOF_PLATFORMS, type ProofPlatform } from './proof-app.ts';

export const PROOF_REPORT_VERSION = 'markless.proof-report/0';

/** One platform's results for a run; a proof needs one passing report per platform over the same rungs. */
export type ProofReport = {
	readonly version: typeof PROOF_REPORT_VERSION;
	readonly platform: ProofPlatform;
	readonly rungs: ReadonlyArray<{
		readonly name: string;
		readonly failure: FlowFailure | null;
		readonly installSeconds: number;
		readonly flowSeconds: number;
	}>;
};

/** Passes only when every platform has a report, all reports cover the same rungs, and every rung passed on each. */
export function proofVerdict(reports: ReadonlyArray<ProofReport>): {
	readonly passed: boolean;
	readonly problems: ReadonlyArray<string>;
} {
	const problems: string[] = [];
	for (const report of reports) {
		if (report.version !== PROOF_REPORT_VERSION)
			problems.push(`a report has version ${String(report.version)}`);
	}
	for (const platform of PROOF_PLATFORMS) {
		const count = reports.filter((report) => report.platform === platform).length;
		if (count === 0) problems.push(`${platform} was not run`);
		if (count > 1) problems.push(`${platform} has ${count} reports`);
	}
	const names = (report: ProofReport) => report.rungs.map((rung) => rung.name).join(', ');
	const first = reports[0];
	for (const report of reports.slice(1)) {
		if (first && names(report) !== names(first)) {
			problems.push(
				`${report.platform} ran ${names(report)} but ${first.platform} ran ${names(first)}`,
			);
		}
	}
	for (const report of reports) {
		for (const rung of report.rungs) {
			if (rung.failure) problems.push(`${rung.name} failed on ${report.platform}`);
		}
	}
	return { passed: problems.length === 0, problems };
}
