import { state } from '@markless/core';

// An interactive component inside an `@if` arm inside a value-keyed `@for` row.
// Each rendered instance owns its own `hits`, so clicking one row's button must
// move that row's number and leave every sibling row's number alone.
// `onBump` is what makes the compiled handler a BOUND symbol: it captures a
// value the parent passed, so the resolver binds a capture context around the
// child's own symbol rather than routing the plain per-instance one.
function RowCounter({ label, onBump }) @{
	let hits = state(0);
	<button
		type="button"
		data-counter={label}
		onClick={(event) => {
			hits++;
			onBump?.(event);
		}}
	>{hits}</button>
}

export default function RowBoundSymbolPage() @{
	let bumps = state(0);
	let rows = state([
		{ key: 'alpha', label: 'alpha', open: true },
		{ key: 'beta', label: 'beta', open: true },
	]);

	<main>
		<output data-bumps>{bumps}</output>
		<ul data-rows>
			@for (const row of rows; key row.key) {
				<li data-row={row.key}>
					@if (row.open) {
						<RowCounter label={row.label} onBump={() => { bumps++; }} />
					} @else {
						<span data-closed>closed</span>
					}
				</li>
			}
		</ul>
	</main>
}
