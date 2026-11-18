import { computed, state } from '@markless/core';
import { loadPage } from './pages.ts';

export default function TwoHoleLabel() @{
	let sheet = state(1);
	const shown = computed(async () => {
		const asked = sheet;
		return { sheet: asked, ...(await loadPage(asked)) };
	});

	<article>
		@try {
			<div class="pager">
				<button data-next disabled={shown.sheet >= shown.total} onClick={() => sheet++}>Forward</button>
				<h2 data-label>Page {shown.sheet} of {shown.total}</h2>
				<ol>
					@for (const entry of shown.rows; key entry.id) {
						<li data-row>{entry.name}</li>
					}
				</ol>
			</div>
		} @pending {
			<em data-loading>wait</em>
		} @catch (problem, reset) {
			<div data-error>
				{problem.message}
				<button data-retry onClick={reset}>again</button>
			</div>
		}
	</article>
}
