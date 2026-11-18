import { computed, state } from '@markless/core';
import { loadReport } from './service.ts';

export function Refresh() @{
	let id = state('fine');
	const report = computed(async () => await loadReport(id));

	<section>
		<button type="button" data-switch onClick={() => (id = 'later')}>Switch</button>
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
	</section>
}
