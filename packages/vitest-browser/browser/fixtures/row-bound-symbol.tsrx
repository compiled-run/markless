import { shared, state } from '@markless/core';

// A widget-scoped family shaped like the item families (tabs, radio-group,
// checklist): one graph per rendered widget, a root that owns the cells, and a
// part that reaches them through the same `shared()` call. One root per keyed
// `@for` row puts every row's widget graph under that row's `r:<key>:` segment,
// which is what the trigger's BOUND handler has to find.
const rowWidget = shared(
	() => {
		const w = state({ ticks: 0 });
		return {
			...w,
			bump() {
				w.ticks = w.ticks + 1;
			},
		};
	},
	{ scope: 'widget' },
);

function WidgetRoot({ children }) @{
	const w = rowWidget();
	<div data-widget-root data-widget-ticks={w.ticks}>{children}</div>
}

// `onBump` makes this handler a BOUND symbol, exactly as `RowCounter`'s does,
// and `w.bump()` is the widget-scoped write that bound body has to land. The two
// together are pagination's shape: an item part inside a row whose handler takes
// a consumer callback and calls a family method.
function WidgetTrigger({ onBump }) @{
	const w = rowWidget();
	<button
		type="button"
		data-widget-trigger
		onClick={(event) => {
			w.bump();
			onBump?.(event);
		}}
	>{w.ticks}</button>
}

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

// `data-outside-widget` is pagination's own shape: one root OUTSIDE the repeat,
// owning a single widget graph, with every interactive part projected from
// INSIDE a row. Each trigger's record then carries a row segment no widget root
// was ever registered under, and all of them must still land on that one root.
export default function RowBoundSymbolPage() @{
	let bumps = state(0);
	let widgetBumps = state(0);
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
		<output data-widget-bumps>{widgetBumps}</output>
		<ul data-widget-rows>
			@for (const widgetRow of rows; key widgetRow.key) {
				<li data-widget-row={widgetRow.key}>
					<WidgetRoot>
						<WidgetTrigger onBump={() => { widgetBumps++; }} />
					</WidgetRoot>
				</li>
			}
		</ul>
		<div data-page-widget>
			<WidgetRoot>
				<WidgetTrigger onBump={() => { widgetBumps++; }} />
			</WidgetRoot>
		</div>

		<div data-outside-widget>
			<WidgetRoot>
				@for (const seat of rows; key seat.key) {
					<span data-seat={seat.key}>
						<WidgetTrigger onBump={() => { widgetBumps++; }} />
					</span>
				}
			</WidgetRoot>
		</div>
	</main>
}
