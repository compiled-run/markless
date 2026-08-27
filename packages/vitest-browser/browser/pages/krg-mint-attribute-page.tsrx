import { state } from '@markless/core';

// The row shape the mint used to refuse: static markup, text off the item, and
// an ATTRIBUTE off the item. The list is seeded EMPTY on purpose, so the server
// paints no row at all and every row the assertions read is one this client
// built - which makes the attribute the whole question, because a row minted
// without it looks right and answers nothing.
export default function KrgMintAttributePage() @{
	let shown = state([]);

	<section data-krg-attr-page>
		<button type="button" data-krg-attr-grow onClick={() => shown = [
			{ id: 'a', label: 'alpha' },
			{ id: 'b', label: 'bravo' },
		]}>grow</button>
		<button type="button" data-krg-attr-more onClick={() => shown = [
			{ id: 'a', label: 'alpha' },
			{ id: 'b', label: 'bravo' },
			{ id: 'c', label: 'charlie' },
		]}>more</button>
		<button type="button" data-krg-attr-clear onClick={() => shown = []}>clear</button>
		<output data-krg-attr-count>{shown.length}</output>
		<ul data-krg-attr-list>
			<li data-krg-attr-header>header</li>
			@for (const item of shown; key item.id) {
				<li data-krg-attr-row data-row={item.id}>{item.label}</li>
			}
		</ul>
		<p data-krg-attr-tail>tail</p>
	</section>
}
