import { computed } from '@markless/core';
import { loadReport } from './service.ts';

export function ReportCard({ id }: { readonly id: string }) @{
	const report = computed(async () => await loadReport(id));

	@try {
		<p data-ok>{report}</p>
	} @pending {
		<p data-pending>Loading</p>
	} @catch (error, reset) {
		<p data-error>
			{error.message}
			<button type="button" data-reset onClick={reset}>Retry</button>
		</p>
	}
}
