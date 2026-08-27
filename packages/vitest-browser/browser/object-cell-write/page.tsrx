import { computed, state } from '@markless/core';

export default function ObjectCellWritePage() @{
	const s = state({ own: { x: 1, y: 2 }, list: [10, 20] });
	const shifted = computed(() => s.own.x + 100);
	const rows = computed(() => s.list.length);

	<section data-ocw-page>
		<output data-ocw-x>{s.own.x}</output>
		<output data-ocw-y>{s.own.y}</output>
		<output data-ocw-shifted>{shifted}</output>
		<output data-ocw-rows>{rows}</output>
		<button
			type="button"
			data-ocw-write-object
			onClick={() => {
				s.own = { x: 5, y: 7 };
			}}
		>whole object</button>
		<button
			type="button"
			data-ocw-write-object-local
			onClick={() => {
				const rect = { x: 8, y: 9 };
				s.own = rect;
			}}
		>whole object from a local</button>
		<button
			type="button"
			data-ocw-write-field
			onClick={() => {
				s.own.x = 3;
			}}
		>one field</button>
		<button
			type="button"
			data-ocw-write-array
			onClick={() => {
				s.list = [10, 20, 30];
			}}
		>whole array</button>
	</section>
}
