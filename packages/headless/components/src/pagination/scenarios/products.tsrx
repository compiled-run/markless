import { computed, state } from '@markless/core';
import * as pagination from '../index.ts';

// The realistic one: twenty pages, so the range has gaps and the set of rendered
// controls CHANGES as the page moves.
//
// The range is the FAMILY's output now, not the consumer's arithmetic: the
// accessor comes off the same namespace the tags do, and which pages and which
// gaps it decides on is the family's business. The `<ul>`, the `<li>`s and the
// ellipsis are still the consumer's own markup.
//
// The surface the owner ratified is `const p = pagination.state(); const entries
// = computed(() => p.getEntries())`. It does not compile: a consumer module
// cannot read another module's shared state
// (MARKLESS_STATE_HELPER_RETURN_UNSUPPORTED - see the note in ../index.ts), so
// this reads the family's pure accessor over numbers it already owns instead.
// The cost is visible in the line below: the count is written twice, here and on
// the root, which is exactly what reading it off the family state would fix.
//
// The `<ul>` is load-bearing, not decoration: a construct cannot open directly
// inside a component tag's children, so the loop needs an element to open in.
export default function Products() @{
	const nav = state({ page: 1, calls: 0 });
	const entries = computed(() => pagination.entries(nav.page, 20, 1));

	<section>
		<h2 data-testid="heading">Page {nav.page} of 20</h2>
		<pagination.root
			count={20}
			page={nav.page}
			data-testid="root"
			onChange={(next: number) => {
				nav.page = next;
				nav.calls = nav.calls + 1;
			}}
		>
			<ul data-testid="pages">
				<li>
					<pagination.backtrigger data-testid="backtrigger">Previous</pagination.backtrigger>
				</li>
				@for (const entry of entries; key entry.key) {
					<li>
						@if (entry.type === 'page') {
							<pagination.item value={entry.value} data-testid="item">
								<pagination.itemtrigger
									data-testid="itemtrigger"
									data-page={entry.value}
								>{entry.value}</pagination.itemtrigger>
							</pagination.item>
						} @else {
							<span aria-hidden="true" data-testid="ellipsis">…</span>
						}
					</li>
				}
				<li>
					<pagination.forwardtrigger data-testid="forwardtrigger">Next</pagination.forwardtrigger>
				</li>
			</ul>
		</pagination.root>
		<p data-testid="calls">{nav.calls}</p>
	</section>
}
