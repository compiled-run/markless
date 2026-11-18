import { computed, state } from '@markless/core';
import { loadReport } from './service.ts';

export function Page() @{
	let id = state('first');
	let tries = state(0);
	let attempt = state(1);
	const report = computed(async () => {
		const asked = `${id}`;
		const round = tries;
		return `${await loadReport(asked)} #${round}`;
	});

	<section>
		<button type="button" data-switch onClick={() => (id = 'later')}>Switch</button>
		<button type="button" data-next onClick={() => attempt++}>Next</button>
		<button type="button" data-again onClick={() => tries++}>Again</button>
		@try {
			<p data-ok>{report}</p>
		} @pending {
			<p data-pending>Loading</p>
		} @catch (error, reset) {
			<>
				<p data-error>{error.message} (attempt {attempt})</p>
				<button type="button" data-reset onClick={reset}>Retry</button>
			</>
		}
	</section>
}
