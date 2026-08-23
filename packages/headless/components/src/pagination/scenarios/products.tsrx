import { computed, state } from '@markless/core';
import { pageRange } from '../index.ts';
import * as pagination from '../index.ts';

// The realistic one: twenty pages, so the range has gaps and the set of rendered
// controls CHANGES as the page moves. `pageRange` is a plain function and the
// consumer holds it in a `computed()` - the family never computes a range, and
// the `<ul>`, the `<li>`s and the ellipsis are all the consumer's own markup.
//
// The `<ul>` is load-bearing, not decoration: a construct cannot open directly
// inside a component tag's children, so the loop needs an element to open in.
export default function Products() @{
	const nav = state({ page: 1, calls: 0 });
	const entries = computed(() => pageRange(nav.page, 20, 1));

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
				@for (const entry of entries; index i; key i) {
					<li>
						@if (entry.type === 'page') {
							<pagination.itemtrigger
								value={entry.value}
								data-testid="itemtrigger"
								data-page={entry.value}
							>{entry.value}</pagination.itemtrigger>
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
