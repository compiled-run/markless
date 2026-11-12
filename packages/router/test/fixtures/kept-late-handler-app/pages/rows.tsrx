import { state } from '@markless/core';
import { Link } from '@markless/router';

export default function Page() @{
	let picked = state('none');
	const items = state([{ id: 'a' }, { id: 'b' }]);

	<main data-main="rows">
		<h1 data-title>{'Rows page'}</h1>
		<ul>
			@for (const item of items; key item.id) {
				<li>
					<button type="button" data-pick={item.id} onClick={() => (picked = item.id)}>{item.id}</button>
				</li>
			}
		</ul>
		<span data-picked>{picked}</span>
		@if (picked !== 'none') {
			<em data-picked-note>{'Picked'}</em>
		}
		<Link href="/reference" data-nav="reference">{'Reference'}</Link>
	</main>
}
