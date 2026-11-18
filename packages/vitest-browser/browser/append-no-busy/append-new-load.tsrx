import { computed, state } from '@markless/core';
import { delay, getPage } from './pages.ts';

function PageRow({ cursor }: { cursor: number }) @{
	const page = computed(async () => getPage(cursor));
	@try {
		<p data-row>{page.items.join(', ')}</p>
	} @pending {
		<p data-row-pending>Loading page</p>
	}
}

// Appending a cursor starts a new load: a new row's own first load, and a re-run of the value keyed by the last cursor.
export function AppendNewLoad() @{
	const first = computed(async () => getPage(0));
	let cursors = state<ReadonlyArray<number>>([]);
	const latest = computed(async () => getPage(cursors.at(-1) ?? 0, cursors.length));

	<div>
		@try {
			<section data-arm>
				<p data-first>{first.items.join(', ')}</p>
				<p data-latest>{latest.items.join(', ')}</p>
				@for (const cursor of cursors; key cursor) {
					<PageRow cursor={cursor} />
				}
				<button type="button" data-more onClick={async () => {
						await delay(20);
						cursors = [...cursors, (cursors.length + 1) * 2];
					}}>
					More
				</button>
			</section>
		} @pending {
			<p data-pending>Loading</p>
		} @catch (error) {
			<p data-failed>{error.message}</p>
		}
	</div>
}
