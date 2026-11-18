import { computed, state } from '@markless/core';
import { listBooks } from './api.ts';

export default function Catalog({ filter }: { readonly filter: string }) @{
	let picked = state('');
	const books = computed(async ({ signal }) => listBooks(filter, signal));

	<div data-catalog>
		@try {
			<ul>
				@for (const book of books; key book.id) {
					<li>
						<button data-pick onClick={() => (picked = book.title)}>{book.title}</button>
					</li>
				}
			</ul>
		} @pending {
			<p>Loading</p>
		} @catch {
			<p>Failed</p>
		}
		<output data-picked>{picked}</output>
	</div>
}
