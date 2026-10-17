import { state } from '@markless/core';

export default function KeyedBoundRows() @{
	let items = state<{ id: number; label: string }[]>([]);
	let next = state(1);

	<main>
		<button type="button" data-add onClick={() => { items = [...items, { id: next, label: 'item ' + next }]; next = next + 1; }}>add</button>
		<button type="button" data-clear onClick={() => items = []}>clear</button>
		<ul>
			<li data-head>head</li>
			@for (const item of items; key item.id) {
				<li id={'row-' + item.id} class="row" data-row={item.id}>{item.label}</li>
			} @empty {
				<li data-empty>none</li>
			}
			<li data-tail>tail</li>
		</ul>
	</main>
}
