import { computed, state } from '@markless/core';
import { loadReport } from './service.ts';

export function SlowPage() @{
	let attempt = state(1);
	const report = computed(async () => await loadReport('slow'));

	<article>
		<button type="button" data-next onClick={() => attempt++}>Next</button>
		@try {
			<p data-ok>{report}</p>
		} @pending {
			<p data-pending>Loading</p>
		} @catch (failure) {
			<p data-error>Attempt {attempt}: {failure.message}</p>
		}
	</article>
}
