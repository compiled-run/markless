import { computed, state } from '@markless/core';

export default function Ledger(props: { id: string }) @{
	let order = state(['a', 'b', 'c']);
	let mark = state('');
	const rows = computed(() => order.map((key) => ({ key, text: key.toUpperCase() + mark })));
	<section id={props.id}>
		<button data-op="write" onClick={() => { mark = mark + '1'; }}>write</button>
		<button data-op="reverse" onClick={() => { order = [...order].reverse(); }}>reverse</button>
		<button data-op="remove" onClick={() => { order = order.slice(1); }}>remove</button>
		<button data-op="add" onClick={() => { order = [...order, 'n' + order.length]; }}>add</button>
		<ul>@for (const row of rows; key row.key) { <li>{row.text}</li> }</ul>
	</section>
}
