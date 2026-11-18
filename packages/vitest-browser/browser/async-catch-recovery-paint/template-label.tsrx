import { computed, state } from '@markless/core';
import { loadPage } from './pages.ts';

export default function TemplateLabel() @{
	let page = state(1);
	const current = computed(async () => {
		const chosen = page;
		return { page: chosen, ...(await loadPage(chosen)) };
	});

	<main>
		<button data-next onClick={() => page++}>Next</button>
		@try {
			<section>
				<p data-label>{`Page ${current.page}`}</p>
				<ul>
					@for (const row of current.rows; key row.id) {
						<li data-row>{row.name}</li>
					}
				</ul>
			</section>
		} @pending {
			<p data-loading>Loading</p>
		} @catch (error) {
			<p data-error>{error.message}</p>
		}
	</main>
}
