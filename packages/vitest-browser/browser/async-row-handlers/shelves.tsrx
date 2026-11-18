import { state } from '@markless/core';

export default function Shelves() @{
	let read = state('-');
	let shelves = state([
		{ name: 'a', open: true, books: [{ isbn: '1', title: 'One' }] },
		{ name: 'b', open: false, books: [{ isbn: '2', title: 'Two' }] },
	]);

	<div>
		<output data-read>{read}</output>
		<button data-toggle onClick={() => (shelves = shelves.map((shelf) => ({ ...shelf, open: !shelf.open })))}>toggle</button>
		<button data-add onClick={() => (shelves = [...shelves, { name: 'c', open: true, books: [{ isbn: '3', title: 'Three' }] }])}>add</button>
		@for (const shelf of shelves; key shelf.name) {
			<article>
				@if (shelf.open) {
					<ol>
						@for (const book of shelf.books; key book.isbn) {
							<li><button data-book onClick={() => (read = `${shelf.name}:${book.title}`)}>{book.title}</button></li>
						}
					</ol>
				} @else {
					<p data-closed>closed</p>
				}
			</article>
		}
	</div>
}
