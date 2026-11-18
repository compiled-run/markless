You are taking part in a study of API design. Answer from this prompt alone: do not read files, search the repository or any code, run commands, or use the web. Do not use any tools at all.

Markless is a UI framework whose components are written in `.tsrx` files. Below, between the markers, is the Markless guidance you have.

=== MARKLESS GUIDANCE ===
# Markless (short guidance)

- Import `state`, `computed`, `element`, `shared` and `storage` from `@markless/core`. Components live in `.tsrx` files.
- Declare mutable state with `state(...)`, derived values with `computed(...)`, and update state by assignment. No hooks, no effects, no re-renders.
- Treat event arguments as native events.

## Shape

```tsrx
import { computed, state } from '@markless/core';
import { getItems, getQuote } from './api.ts';

function Row({ id }: { id: number }) @{
	const quote = computed(async () => await getQuote(id));
	<li>
		@try {
			<span>{quote.price}</span>
		} @pending {
			<span>Loading…</span>
		} @catch (error, reset) {
			<button onClick={reset}>{error.message}</button>
		}
	</li>
}

export default function App() @{
	let query = state('');
	let reload = state(0);
	const items = computed(async ({ signal }) => {
		reload;
		return await getItems(query, signal);
	});

	<main>
		<input value={query} onInput={(event) => (query = event.currentTarget.value)} />
		<button onClick={() => reload++}>Refresh</button>
		@try {
			<ul>
				@for (const item of items; key item.id) {
					<Row id={item.id} />
				}
			</ul>
		} @pending {
			<p>Loading…</p>
		} @catch (error, reset) {
			<p>
				{error.message}
				<button onClick={reset}>Retry</button>
			</p>
		}
	</main>
}
```

- The body runs once: no hooks, effects, `onMount` or re-renders. Update state by assignment (`reload++`). Widen a type with `state<number | null>(null)`.
- A body is `@{ statements; one root element }`. Props follow the parent's state. A callback prop takes at most one parameter.
- Every `@try`, `@pending`, `@catch`, `@if`, `@else` and `@for` block holds exactly one node; wrap siblings in an element or `<>…</>`.
- `@try` needs `@pending` or `@catch` (or both, in that order). `@catch` may name `(error)` or `(error, reset)`.
- An async computed is typed as its resolved value and read only inside `@try`, including by handlers there.
- It runs again when any state it reads changes (`reload;` is a read). Only the newest run's answer is shown; `signal` aborts the old request.
- Each component instance has its own state and loads, so a row component gives each row its own `@try`.
- In `@catch`, put `error.message` and state in separate `{}`. A handler in `@catch` cannot read `error`. Only `error.name` and `error.message` survive.
=== END MARKLESS GUIDANCE ===

The app is built from one codebase as an iPhone app, an Android app and a website. Between the markers is the signature sheet of the components it uses, which is everything published about them.

=== SIGNATURE SHEET ===
```ts
// Module: @markless/ui (excerpt)
// Families of parts with behaviour (keyboard, focus, state) and no styles. The author styles them from a stylesheet: each
// part's element carries `ui-*` attributes (for example `ui-open`) to style against.
type Div = { class?: string; children?: unknown };
// The modal family: a dialog. <modal.root> holds an optional modal.trigger and modal.backdrop, which wraps modal.content;
// modal.title, modal.description and modal.close go inside the content. `alert` makes it an alert dialog.
export declare const modal: {
	root: (props: Div & { open?: boolean; alert?: boolean; onChange?: (open: boolean) => void }) => Element;
	trigger: (props: Div & { onClick?: (event: MouseEvent) => void }) => Element;
	backdrop: (props: Div) => Element;
	content: (props: Div & { 'aria-label'?: string }) => Element;
	title: (props: Div) => Element;
	description: (props: Div) => Element;
	close: (props: Div & { onClick?: (event: MouseEvent) => void }) => Element;
};
// The drawer family: a panel that slides in from an edge and can be dragged closed (the bottom edge unless `orientation`/`start` say
// otherwise). Anatomy: <drawer.root> holds an optional drawer.trigger and drawer.backdrop, which wraps drawer.content;
// drawer.title, drawer.description and drawer.close go inside the content. Omit `open` and it starts closed;
// drawer.trigger opens it and drawer.close closes it. Every part is unstyled: the author draws all of it.
export declare const drawer: {
	root: (props: Div & { open?: boolean; onChange?: (open: boolean) => void; modal?: boolean; orientation?: 'horizontal' | 'vertical'; start?: boolean; snapPoints?: readonly number[] }) => Element;
	trigger: (props: Div & { onClick?: (event: MouseEvent) => void }) => Element;
	backdrop: (props: Div) => Element;
	content: (props: Div & { 'aria-label'?: string }) => Element;
	title: (props: Div) => Element;
	description: (props: Div) => Element;
	close: (props: Div & { onClick?: (event: MouseEvent) => void }) => Element;
};
// HTML: a plain <dialog> works as in the browser: render it with `open` to show it.

// How these look on each platform:
// On iPhone and Android, a `<dialog>` and the `modal` family are drawn as a bottom sheet by default: the panel slides up from the bottom edge, the grab handle and swipe-to-close included.
// The author's CSS on the dialog or on `modal.content` (for example `margin: auto` or `inset`) overrides that placement.
// An alert dialog (`<modal.root alert>` or `<dialog role="alertdialog">`) stays a centered box.
// The `drawer` family is a bottom sheet on every platform.
// On the website, `<dialog>` and `modal` are centered boxes.
```
=== END SIGNATURE SHEET ===

Using it, write this:

Write one page, `pages/checkout.tsrx`, with:
1. A "Filters" button that opens a panel with three filter checkboxes (Vegan, Gluten-free, Under $10) and an Apply button that closes it.
2. A "Delete" button that asks "Delete this order?" with Delete and Cancel.
3. A "Deliver to" line with a "Change" button that opens a list of three saved addresses; choosing one closes the list and shows the choice.
Choose the element you think fits each one.

Output format:
- One or more fenced code blocks. Start every code block with a first-line comment `// file: <path>`.
- Then a line `Confidence: N/5`.
- Then a heading `## Phone` with one line per numbered piece saying what an iPhone user sees: centered box, bottom sheet, full screen, or other.
- Then a heading `## Website` with the same for a website visitor on a laptop.
- Then a heading `## Guesses` listing anything you had to guess.
- End with a line `Tools used: none` (or name any tool you used).
