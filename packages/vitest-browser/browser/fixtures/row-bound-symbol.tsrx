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

// --- pagination's full shape: two widget families, one nested in the other ---
//
// `navWidget` is rooted OUTSIDE the repeat and holds the page. `seatWidget` is
// rooted by the ITEM part, which the consumer writes INSIDE the repeat, so one
// seat instance exists per rendered row. The trigger nested inside the item
// reads BOTH: the row's own seat and the root's page. That is
// `pagination.root` / `pagination.item` / `pagination.itemtrigger` exactly.
const navWidget = shared(
	() => {
		const nav = state({ page: 1 });
		return {
			...nav,
			// `value = 1` rather than a type annotation: the capture analysis parses
			// this inlined body with a JavaScript-only parser, as the pagination
			// family's own `goTo` explains.
			goTo(value = 1) {
				nav.page = value;
			},
		};
	},
	{ scope: 'widget' },
);

const seatWidget = shared(
	() => {
		const seat = state({ value: 1, hits: 0 });
		return {
			...seat,
			hit() {
				seat.hits = seat.hits + 1;
			},
		};
	},
	{ scope: 'widget' },
);

function NavRoot({ children }) @{
	const nav = navWidget();
	<div data-nav-root data-nav-page={nav.page}>{children}</div>
}

// The item seeds its own seat and is the widget root every control inside it
// resolves to. It reads the root's page as well, so its rendered attribute
// proves the page moved without asking the trigger.
function NavItem({ value, children }) @{
	const nav = navWidget();
	const seat = seatWidget();
	seat.value = value;
	<div
		data-nav-item={value}
		data-nav-hits={seat.hits}
		data-nav-active={nav.page === seat.value}
	>{children}</div>
}

// `onClick` is what makes this handler a BOUND symbol, as `PaginationItemTrigger`'s
// does. `seat.hit()` moves THIS row's item widget; `nav.goTo(seat.value)` moves
// the root's page and can only send the right number if the row's own seat is
// what the dispatch read.
function NavItemTrigger({ onClick }) @{
	const nav = navWidget();
	const seat = seatWidget();
	<button
		type="button"
		data-nav-trigger={seat.value}
		onClick={(event) => {
			seat.hit();
			nav.goTo(seat.value);
			onClick?.(event);
		}}
	>{seat.hits}</button>
}

// `data-outside-widget` is pagination's own shape: one root OUTSIDE the repeat,
// owning a single widget graph, with every interactive part projected from
// INSIDE a row. Each trigger's record then carries a row segment no widget root
// was ever registered under, and all of them must still land on that one root.
export default function RowBoundSymbolPage() @{
	let bumps = state(0);
	let widgetBumps = state(0);
	let navCalls = state(0);
	let rows = state([
		{ key: 'alpha', label: 'alpha', open: true },
		{ key: 'beta', label: 'beta', open: true },
	]);
	let seats = state([
		{ key: 'seat:1', value: 1, kind: 'page' },
		{ key: 'seat:2', value: 2, kind: 'page' },
		{ key: 'gap', value: 0, kind: 'gap' },
		{ key: 'seat:3', value: 3, kind: 'page' },
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

		<output data-nav-calls>{navCalls}</output>
		<div data-nav>
			<NavRoot>
				<ul data-nav-seats>
					@for (const entry of seats; key entry.key) {
						<li>
							@if (entry.kind === 'page') {
								<NavItem value={entry.value}>
									<NavItemTrigger onClick={() => { navCalls++; }} />
								</NavItem>
							} @else {
								<span data-nav-gap>…</span>
							}
						</li>
					}
				</ul>
			</NavRoot>
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
