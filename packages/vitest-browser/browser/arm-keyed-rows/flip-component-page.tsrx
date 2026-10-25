import { computed, state } from '@markless/core';

function Rows(props: { rows: ReadonlyArray<{ key: string; text: string }> }) @{
	<ul>@for (const row of props.rows; key row.key) { <li>{row.text}</li> }</ul>
}

export default function FlipComponentPage() @{
	let open = state(true);
	let order = state(['a', 'b', 'c']);
	let mark = state('');
	const rows = computed(() => order.map((key) => ({ key, text: key.toUpperCase() + mark })));
	<main>
		<button data-toggle onClick={() => { open = !open; }}>toggle</button>
		<section id="inside">
			<button data-op="write" onClick={() => { mark = mark + '1'; }}>write</button>
			<button data-op="reverse" onClick={() => { order = [...order].reverse(); }}>reverse</button>
			<button data-op="remove" onClick={() => { order = order.slice(1); }}>remove</button>
			<button data-op="add" onClick={() => { order = [...order, 'n' + order.length]; }}>add</button>
			@if (open) { <><Rows rows={rows} /></> }
		</section>
	</main>
}
