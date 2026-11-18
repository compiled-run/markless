import { computed, state } from '@markless/core';
import { getPage, type Page } from './pages.ts';

// More appends a fetched page to local state; Reload re-runs the shown async value.
export function AppendWithCatch() @{
	let version = state(0);
	const first = computed(async () => getPage(0, version));
	let more = state<ReadonlyArray<Page>>([]);
	let loading = state(false);
	const items = computed(() => [first, ...more].flatMap((page) => page.items));
	const next = computed(() => (more.at(-1) ?? first).next);

	<div>
		@try {
			<section data-arm>
				<ul data-items>
					@for (const item of items; key item) {
						<li>{item}</li>
					}
				</ul>
				<button
					type="button"
					data-more
					onClick={async () => {
						if (next === null) return;
						loading = true;
						try {
							more = [...more, await getPage(next)];
						} finally {
							loading = false;
						}
					}}
					disabled={next === null || loading}
				>
					{loading ? 'Loading more' : next !== null ? 'More' : 'Nothing more'}
				</button>
				<button
					type="button"
					data-reload
					onClick={async () => {
						await getPage(1);
						version++;
					}}
				>
					Reload
				</button>
			</section>
		} @pending {
			<p data-pending>Loading</p>
		} @catch (error) {
			<p data-failed>{error.message}</p>
		}
	</div>
}
