import { computed } from '@markless/core';
import { loadReport } from './service.ts';

export function Nested() @{
	const outer = computed(async () => await loadReport('outer'));
	const inner = computed(async () => await loadReport('inner'));

	<section>
		@try {
			<div data-outer-content>
			<h3 data-outer>{outer}</h3>
			<div data-inner-boundary>
				@try {
					<p data-ok>{inner}</p>
				} @pending {
					<p data-pending>Loading</p>
				} @catch (error, reset) {
					<p data-error>
						{error.message}
						<button type="button" data-reset onClick={reset}>Retry</button>
					</p>
				}
			</div>
			</div>
		} @pending {
			<p data-outer-pending>Loading</p>
		} @catch (error) {
			<p data-outer-error>{error.message}</p>
		}
	</section>
}
