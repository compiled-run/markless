import { computed, state } from '@markless/core';

export default function RorPage() @{
	let rows = state([{ id: 1, label: 'a' }, { id: 2, label: 'b' }, { id: 3, label: 'c' }]);
	let selected = state(0);
	const doubled = computed(() => selected * 2);

	<main>
		<output data-selected>{selected}</output>
		<button type="button" data-outer-pick onClick={() => (selected = 3)}>pick3</button>
		<button type="button" data-add onClick={() => (rows = [...rows, { id: rows.length + 1, label: 'n' }])}>add</button>
		<ul>
			@for (const row of rows; key row.id) {
				<li data-row={row.id} class={selected === row.id ? 'on' : 'off'}>
					<button type="button" data-pick={row.id} onClick={() => (selected = row.id)}>{row.label}</button>
					<span data-mark={row.id}>{selected === row.id ? 'yes' : 'no'}</span>
					<em data-double={row.id} title={doubled === row.id * 2 ? 'twice' : 'once'}>{doubled}</em>
				</li>
			}
		</ul>
		<p data-outside class={selected === 2 ? 'on' : 'off'}>outside</p>
		<style>
			.on { font-weight: bold; }
		</style>
	</main>
}
