// Control: a keyed `@for` over a PLAIN const array (no state()), no widget.
export function App() @{
	const rows = [
		{ id: 'r1', label: 'alpha' },
		{ id: 'r2', label: 'beta' },
		{ id: 'r3', label: 'gamma' },
	];

	<section data-ctl-page>
		@for (const row of rows; key row.id) {
			<div data-row={row.id}>{row.label}</div>
		}
	</section>
}
