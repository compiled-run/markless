import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import RowBoundSymbolPage from './fixtures/row-bound-symbol.tsrx';

afterEach(() => cleanup());

// A component placed under an `@if` arm inside a value-keyed `@for` row is the
// row's own instance: its state cells live under the row's `r:<key>:` segment.
// The handler compiled for it is a BOUND symbol, whose id carries only the
// build-time branch/repeat scope - no row value. Unless the dispatched record's
// row segment reaches the symbol's execution context, the write either lands
// nowhere or, worse, silently lands on another row. Both rows are asserted on
// every click for exactly that reason.
function counter(container: HTMLElement, label: string): HTMLButtonElement {
	const found = container.querySelector<HTMLButtonElement>(`[data-counter="${label}"]`);
	if (!found) throw new Error(`Expected the ${label} row's counter button.`);
	return found;
}

function readings(container: HTMLElement): Record<string, string> {
	return {
		alpha: counter(container, 'alpha').textContent ?? '',
		beta: counter(container, 'beta').textContent ?? '',
	};
}

// The callback the row passed down is the page's OWN cell, reached through the
// bound symbol's capture adapter. Threading the row must not drag that read into
// the row's space, so every row's click is counted here in page space.
function bumps(container: HTMLElement): string {
	return container.querySelector('[data-bumps]')?.textContent ?? '';
}

// --- widget-scoped writes from a row's bound handler -----------------------
//
// The second half of the fixture puts a whole widget-scoped family in each row:
// a root that owns the family's cells and a trigger part that reaches them
// through the same `shared()` call. Because the root is INSIDE the `@for`, each
// row's widget graph is registered under that row's `r:<key>:` segment, while
// the trigger's handler is a bound symbol whose id names only the build-time
// edge. Resolving the widget root with the edge path alone finds no root at all,
// so `w.bump()` writes to a page-space id nothing is listening on: the record
// matches, the symbol runs, and the number never moves.
function widgetRow(container: HTMLElement, key: string): HTMLElement {
	const found = container.querySelector<HTMLElement>(`[data-widget-row="${key}"]`);
	if (!found) throw new Error(`Expected the ${key} widget row.`);
	return found;
}

function widgetTrigger(container: HTMLElement, key: string): HTMLButtonElement {
	const found = widgetRow(container, key).querySelector<HTMLButtonElement>(
		'[data-widget-trigger]',
	);
	if (!found) throw new Error(`Expected the ${key} row's widget trigger.`);
	return found;
}

// The root's own attribute and the trigger's text read the SAME widget cell from
// two different instance paths, so a fix that moves only one of them is caught.
function widgetTicks(container: HTMLElement, key: string): { root: string; trigger: string } {
	return {
		root: widgetRow(container, key).querySelector('[data-widget-root]')?.getAttribute(
			'data-widget-ticks',
		) ?? '',
		trigger: widgetTrigger(container, key).textContent ?? '',
	};
}

function widgetBumps(container: HTMLElement): string {
	return container.querySelector('[data-widget-bumps]')?.textContent ?? '';
}

// The same family rooted OUTSIDE the `@for`, so its root is registered at page
// scope. It is the other direction of the fix: threading the row must reach a
// row's root without ever reaching this one, and clicking it must keep working
// exactly as it did before any row existed.
function pageWidget(container: HTMLElement): HTMLElement {
	const found = container.querySelector<HTMLElement>('[data-page-widget]');
	if (!found) throw new Error('Expected the page-scope widget.');
	return found;
}

function pageWidgetTrigger(container: HTMLElement): HTMLButtonElement {
	const found = pageWidget(container).querySelector<HTMLButtonElement>('[data-widget-trigger]');
	if (!found) throw new Error("Expected the page-scope widget's trigger.");
	return found;
}

function pageWidgetTicks(container: HTMLElement): { root: string; trigger: string } {
	return {
		root:
			pageWidget(container)
				.querySelector('[data-widget-root]')
				?.getAttribute('data-widget-ticks') ?? '',
		trigger: pageWidgetTrigger(container).textContent ?? '',
	};
}

test('CSR: a bound symbol under an arm in a keyed row writes its own row', async () => {
	const screen = await render(RowBoundSymbolPage);
	const container = screen.container as HTMLElement;
	expect(readings(container)).toEqual({ alpha: '0', beta: '0' });

	counter(container, 'beta').click();
	await expect.poll(() => counter(container, 'beta').textContent).toBe('1');
	// The dangerous failure is the silent wrong-row write, so alpha is asserted too.
	expect(counter(container, 'alpha').textContent).toBe('0');

	counter(container, 'beta').click();
	await expect.poll(() => counter(container, 'beta').textContent).toBe('2');
	expect(counter(container, 'alpha').textContent).toBe('0');

	counter(container, 'alpha').click();
	await expect.poll(() => counter(container, 'alpha').textContent).toBe('1');
	expect(counter(container, 'beta').textContent).toBe('2');

	// Three clicks across two rows, counted once each on the page's own cell.
	await expect.poll(() => bumps(container)).toBe('3');
});

test('SSR: a resumed bound symbol under an arm in a keyed row writes its own row', async () => {
	const screen = await renderSSR(RowBoundSymbolPage);
	const container = screen.container as HTMLElement;
	expect(readings(container)).toEqual({ alpha: '0', beta: '0' });

	counter(container, 'beta').click();
	await expect.poll(() => counter(container, 'beta').textContent).toBe('1');
	expect(counter(container, 'alpha').textContent).toBe('0');

	counter(container, 'alpha').click();
	await expect.poll(() => counter(container, 'alpha').textContent).toBe('1');
	expect(counter(container, 'beta').textContent).toBe('1');

	await expect.poll(() => bumps(container)).toBe('2');
});

test("CSR: a bound handler in a keyed row writes its own row's widget graph", async () => {
	const screen = await render(RowBoundSymbolPage);
	const container = screen.container as HTMLElement;
	expect(widgetTicks(container, 'alpha')).toEqual({ root: '0', trigger: '0' });
	expect(widgetTicks(container, 'beta')).toEqual({ root: '0', trigger: '0' });

	widgetTrigger(container, 'beta').click();
	await expect.poll(() => widgetTicks(container, 'beta')).toEqual({ root: '1', trigger: '1' });
	// The silent wrong-widget write is the dangerous one, so alpha is asserted too.
	expect(widgetTicks(container, 'alpha')).toEqual({ root: '0', trigger: '0' });

	widgetTrigger(container, 'beta').click();
	await expect.poll(() => widgetTicks(container, 'beta')).toEqual({ root: '2', trigger: '2' });
	expect(widgetTicks(container, 'alpha')).toEqual({ root: '0', trigger: '0' });

	widgetTrigger(container, 'alpha').click();
	await expect.poll(() => widgetTicks(container, 'alpha')).toEqual({ root: '1', trigger: '1' });
	expect(widgetTicks(container, 'beta')).toEqual({ root: '2', trigger: '2' });

	// The captured page cell still counts in page space, one per click.
	await expect.poll(() => widgetBumps(container)).toBe('3');
	// The page's own non-widget rows never moved.
	expect(readings(container)).toEqual({ alpha: '0', beta: '0' });
	// Threading a row never reached the widget rooted outside every row.
	expect(pageWidgetTicks(container)).toEqual({ root: '0', trigger: '0' });
});

test("SSR: a resumed bound handler in a keyed row writes its own row's widget graph", async () => {
	const screen = await renderSSR(RowBoundSymbolPage);
	const container = screen.container as HTMLElement;
	expect(widgetTicks(container, 'alpha')).toEqual({ root: '0', trigger: '0' });
	expect(widgetTicks(container, 'beta')).toEqual({ root: '0', trigger: '0' });

	widgetTrigger(container, 'beta').click();
	await expect.poll(() => widgetTicks(container, 'beta')).toEqual({ root: '1', trigger: '1' });
	expect(widgetTicks(container, 'alpha')).toEqual({ root: '0', trigger: '0' });

	widgetTrigger(container, 'alpha').click();
	await expect.poll(() => widgetTicks(container, 'alpha')).toEqual({ root: '1', trigger: '1' });
	expect(widgetTicks(container, 'beta')).toEqual({ root: '1', trigger: '1' });

	await expect.poll(() => widgetBumps(container)).toBe('2');
	expect(pageWidgetTicks(container)).toEqual({ root: '0', trigger: '0' });
});

// --- a widget rooted OUTSIDE the loop its parts are projected from ----------
//
// No row is involved in this failure, which is what makes it a layer of its own.
// Measured on the base this test was written against: the record `c4:h1`
// matches, `bound:symbol%3A0:component-edge%3A4` runs, and it reads and writes
// `c3:p4:shared:<file>#rowWidget/state:w` - the PROJECTION SITE the part sits
// at, never resolved to the widget root at `c3:` that owns the cells. Nothing
// listens on that id, so the record matches, the symbol runs warm, and the
// number never moves. The bound symbol's graph simply never ran its ids through
// the widget-root lookup, so there was nothing for a row to correct.
//
// This is pagination's shape: `pagination.root` sits outside the consumer's
// `@for` while the interactive item parts are projected inside it.
// The root OUTSIDE the repeat with its parts projected from INSIDE the rows.
// Every trigger's record names a row, but no widget root was ever registered
// under one, so the row pairs answer nothing and the projection site has to.
function outsideWidget(container: HTMLElement): HTMLElement {
	const found = container.querySelector<HTMLElement>('[data-outside-widget]');
	if (!found) throw new Error('Expected the widget rooted outside the repeat.');
	return found;
}

function seatTrigger(container: HTMLElement, key: string): HTMLButtonElement {
	const found = outsideWidget(container).querySelector<HTMLButtonElement>(
		`[data-seat="${key}"] [data-widget-trigger]`,
	);
	if (!found) throw new Error(`Expected the ${key} seat's trigger.`);
	return found;
}

// Root and every seat read the one cell, so a fix that moves only the clicked
// seat - or only the root - is caught.
function outsideWidgetTicks(container: HTMLElement): Record<string, string> {
	return {
		root:
			outsideWidget(container)
				.querySelector('[data-widget-root]')
				?.getAttribute('data-widget-ticks') ?? '',
		alpha: seatTrigger(container, 'alpha').textContent ?? '',
		beta: seatTrigger(container, 'beta').textContent ?? '',
	};
}

test('CSR: parts projected from rows write the widget rooted outside the repeat', async () => {
	const screen = await render(RowBoundSymbolPage);
	const container = screen.container as HTMLElement;
	expect(outsideWidgetTicks(container)).toEqual({ root: '0', alpha: '0', beta: '0' });

	seatTrigger(container, 'beta').click();
	await expect
		.poll(() => outsideWidgetTicks(container))
		.toEqual({ root: '1', alpha: '1', beta: '1' });

	// A different row's part reaches the same root, so the count keeps climbing.
	seatTrigger(container, 'alpha').click();
	await expect
		.poll(() => outsideWidgetTicks(container))
		.toEqual({ root: '2', alpha: '2', beta: '2' });

	// The per-row roots and the root beside them never moved.
	expect(widgetTicks(container, 'alpha')).toEqual({ root: '0', trigger: '0' });
	expect(widgetTicks(container, 'beta')).toEqual({ root: '0', trigger: '0' });
	expect(pageWidgetTicks(container)).toEqual({ root: '0', trigger: '0' });
	await expect.poll(() => widgetBumps(container)).toBe('2');
});

test('SSR: resumed parts projected from rows write the widget rooted outside the repeat', async () => {
	const screen = await renderSSR(RowBoundSymbolPage);
	const container = screen.container as HTMLElement;
	expect(outsideWidgetTicks(container)).toEqual({ root: '0', alpha: '0', beta: '0' });

	seatTrigger(container, 'beta').click();
	await expect
		.poll(() => outsideWidgetTicks(container))
		.toEqual({ root: '1', alpha: '1', beta: '1' });

	seatTrigger(container, 'alpha').click();
	await expect
		.poll(() => outsideWidgetTicks(container))
		.toEqual({ root: '2', alpha: '2', beta: '2' });

	expect(widgetTicks(container, 'beta')).toEqual({ root: '0', trigger: '0' });
	expect(pageWidgetTicks(container)).toEqual({ root: '0', trigger: '0' });
	await expect.poll(() => widgetBumps(container)).toBe('2');
});

test('CSR: a bound handler writes a widget rooted outside every row', async () => {
	const screen = await render(RowBoundSymbolPage);
	const container = screen.container as HTMLElement;
	expect(pageWidgetTicks(container)).toEqual({ root: '0', trigger: '0' });

	pageWidgetTrigger(container).click();
	await expect.poll(() => pageWidgetTicks(container)).toEqual({ root: '1', trigger: '1' });
	// Reaching the root outside the rows must not reach any row's own widget.
	expect(widgetTicks(container, 'alpha')).toEqual({ root: '0', trigger: '0' });
	expect(widgetTicks(container, 'beta')).toEqual({ root: '0', trigger: '0' });

	pageWidgetTrigger(container).click();
	await expect.poll(() => pageWidgetTicks(container)).toEqual({ root: '2', trigger: '2' });
	expect(widgetTicks(container, 'beta')).toEqual({ root: '0', trigger: '0' });

	// The captured page cell still counts in page space, one per click.
	await expect.poll(() => widgetBumps(container)).toBe('2');
});

test('SSR: a resumed bound handler writes a widget rooted outside every row', async () => {
	const screen = await renderSSR(RowBoundSymbolPage);
	const container = screen.container as HTMLElement;
	expect(pageWidgetTicks(container)).toEqual({ root: '0', trigger: '0' });

	pageWidgetTrigger(container).click();
	await expect.poll(() => pageWidgetTicks(container)).toEqual({ root: '1', trigger: '1' });
	expect(widgetTicks(container, 'alpha')).toEqual({ root: '0', trigger: '0' });
	expect(widgetTicks(container, 'beta')).toEqual({ root: '0', trigger: '0' });

	await expect.poll(() => widgetBumps(container)).toBe('1');
});

// Both directions in one dispatch sequence: a root inside a row and a root
// outside every row answer the SAME `shared()` call from the same part, so a fix
// that resolves one by losing the other is caught here rather than in pagination.
test('CSR: row widgets and the widget outside every row stay independent', async () => {
	const screen = await render(RowBoundSymbolPage);
	const container = screen.container as HTMLElement;

	widgetTrigger(container, 'alpha').click();
	await expect.poll(() => widgetTicks(container, 'alpha')).toEqual({ root: '1', trigger: '1' });
	expect(pageWidgetTicks(container)).toEqual({ root: '0', trigger: '0' });

	pageWidgetTrigger(container).click();
	await expect.poll(() => pageWidgetTicks(container)).toEqual({ root: '1', trigger: '1' });
	expect(widgetTicks(container, 'alpha')).toEqual({ root: '1', trigger: '1' });
	expect(widgetTicks(container, 'beta')).toEqual({ root: '0', trigger: '0' });

	widgetTrigger(container, 'beta').click();
	await expect.poll(() => widgetTicks(container, 'beta')).toEqual({ root: '1', trigger: '1' });
	expect(pageWidgetTicks(container)).toEqual({ root: '1', trigger: '1' });
	expect(widgetTicks(container, 'alpha')).toEqual({ root: '1', trigger: '1' });
});
