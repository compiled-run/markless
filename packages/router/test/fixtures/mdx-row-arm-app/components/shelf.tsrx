import { state } from '@markless/core';

export default function Shelf() @{
	let books = state(['Dune', 'Emma']);

	<section>
		<ul>
			@for (const book of books; key book) {
				<li>{book}</li>
			}
		</ul>
		<button data-add onClick={() => books.push(`Book ${books.length + 1}`)}>Add</button>
	</section>
}
