import { computed, shared, state } from '@markless/core';

// One widget graph per rendered ROW: the row component below is the root, so a
// row minted on the client has to bring its own widget graph with it.
const box = shared(() => {
	const b = state({ on: false, label: '' });

	return {
		...b,
		mark: computed(() => (b.on === true ? 'on' : 'off')),
		toggle() {
			b.on = !b.on;
		},
	};
}, { scope: 'widget' });

// The early slice: same module, self-closed at the repeat, body writes the
// widget-scoped seed off its own prop.
function Row({ item, onTap }) @{
	const b = box();
	b.label = item.label;

	<button type="button" data-row={item.key} data-mark={b.mark} onClick={(event) => { b.toggle(); onTap(event.currentTarget.getAttribute('data-row')); }}>
		{b.label}
	</button>
}

export function App() @{
	let tapped = state('none');
	let rows = state([
		{ key: 'north', label: 'North' },
		{ key: 'south', label: 'South' },
	]);

	<main>
		<output data-tapped>{tapped}</output>
		<button data-add onClick={() => rows = [...rows, { key: 'east', label: 'East' }]}>Add</button>
		<button data-drop onClick={() => rows = [...rows].filter((row) => row.key !== 'east')}>Drop</button>
		<div class="rows">
			<h2 data-static>Rows</h2>
			@for (const row of rows; key row.key) {
				<Row item={row} onTap={(key) => tapped = key} />
			}
		</div>
	</main>
}

// The same page with the third row already served, for the equivalence proof.
export function Served() @{
	let tapped = state('none');
	let rows = state([
		{ key: 'north', label: 'North' },
		{ key: 'south', label: 'South' },
		{ key: 'east', label: 'East' },
	]);

	<main>
		<output data-tapped>{tapped}</output>
		<div class="rows">
			<h2 data-static>Rows</h2>
			@for (const row of rows; key row.key) {
				<Row item={row} onTap={(key) => tapped = key} />
			}
		</div>
	</main>
}
