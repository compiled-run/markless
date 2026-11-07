import { computed } from '@markless/core';
import { loadPage } from './api.ts';

// onerow-rekey-stale, unwrapped: re-keying a one-row list must drop the old row and settle the new one, not stay stuck Loading.
export function PageView({ page }: { readonly page: number }) @{
	const current = computed(async () => await loadPage(page));

	@try {
		<section>
			<p data-page-label={page}>{`Page ${page} of ${current.totalPages}`}</p>
			<ul>
				@for (const item of current.items; key item.id) {
					<li data-page-item={item.id}>{item.name}</li>
				}
			</ul>
		</section>
	} @pending {
		<p data-page-loading={page}>Loading…</p>
	} @catch (error, reset) {
		<p data-page-error={page}>
			{error.message}
			<button data-page-retry onClick={reset}>Retry</button>
		</p>
	}
}
