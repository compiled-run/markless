import { computed, state } from '@markless/core';
import { getPage, type Page } from './pages.ts';

export function AppendWithoutCatch() @{
	const first = computed(async () => getPage(0));
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
			</section>
		} @pending {
			<p data-pending>Loading</p>
		}
	</div>
}
