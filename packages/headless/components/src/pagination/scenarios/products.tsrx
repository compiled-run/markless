import { computed, state } from '@markless/core';
import * as pagination from '../index.ts';

// Twenty pages, so the range has gaps and the set of rendered controls CHANGES as the
// page moves. Which pages and which gaps is the family's business; the `<ul>`, the
// `<li>`s and the ellipsis are the consumer's own markup.
//
// `pagination.entries(...)` rather than the ratified `p.getEntries()` accessor: a
// consumer module cannot read another module's shared state yet — see the note in
// ../index.ts. The cost shows below, where the count is written twice.
//
// The `<ul>` is load-bearing, not decoration: a construct cannot open directly inside
// a component tag's children, so the loop needs an element to open in.
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
