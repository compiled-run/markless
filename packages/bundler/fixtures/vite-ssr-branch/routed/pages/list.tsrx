import { element, state } from '@markless/core';

export default function List() @{
	let items = state(['one']);
	let shown = state('');
	const dialogEl = element<HTMLDialogElement>();

	<main>
		<button data-add onClick={() => (items = [...items, `item ${items.length + 1}`])}>Add</button>
		<button data-clear onClick={() => (items = [])}>Clear</button>
		<ol>
			@for (const item of items; key item) {
				<li>{item}</li>
			} @empty {
				<li class="empty">Nothing listed</li>
			}
		</ol>
		<button
			data-open
			onClick={() => {
				shown = items[0] ?? 'none';
				dialogEl?.showModal();
			}}
		>Open</button>
		<dialog el={dialogEl}>
			<p class="shown">{shown}</p>
			<button data-close onClick={() => dialogEl?.close()}>Close</button>
		</dialog>
	</main>
}
