import { state } from '@markless/core';

export function App() @{
	let ready = state(false);
	let items = state([{ id: 'a' }, { id: 'b' }]);

	<main>
		<aside data-idle-host onIdle={() => (ready = true)}>prefs</aside>
		@if (ready) {
			<p data-ready>ready</p>
		}
		<button type="button" data-append onClick={() => (items = [...items, { id: `n${items.length}` }])}>Append</button>
		<ol data-list>
			@for (const item of items; key item.id) {
				<li data-item={item.id}>{item.id}</li>
			}
		</ol>
	</main>
}
