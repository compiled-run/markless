// Imported helper for the squall-badge lowering-gap pin (mirrors the
// dashboard's imported repoOf(view, params.repo) shape).
export function squallOf(report: { pier: string; force: number }, pier: string) {
	return report.pier === pier ? report : undefined;
}
