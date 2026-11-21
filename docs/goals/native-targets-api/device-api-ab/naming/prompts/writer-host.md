You are taking part in a study of API naming. Answer from this prompt alone: do not read files, search the repository or any code, run commands, or use the web. Do not use any tools at all.

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

Markless is a UI framework whose components are written in `.tsrx` files. In `.tsrx`, a component body is `@{ statements; one root element }` and runs once; `state()` values update the page when assigned; `@if`/`@else`, `@try`/`@pending`/`@catch` and `@for` are template blocks. One codebase is built as an iPhone app, an Android app and a website.

You have these packages. This is everything published about them: the type declarations below, and nothing else. `PropsOf<'div'>` means every attribute a `<div>` takes, including `class` and `style`; `Children` is markup between the tags.

```ts
// Module: @markless/device (excerpt)
export declare const platform: 'ios' | 'android' | 'web';
export interface Camera {
	takePhoto(): Promise<Blob>;
}
export declare function camera(): Camera;

// Module: @markless/ui (excerpt): the drawer family
export declare const drawer: {
	root(props: PropsOf<'div'> & { open?: boolean; onChange?: (open: boolean) => void; orientation?: 'horizontal' | 'vertical' }): Element;
	trigger(props: PropsOf<'button'>): Element;
	backdrop(props: PropsOf<'div'>): Element;
	content(props: PropsOf<'div'>): Element;
	title(props: PropsOf<'h2'>): Element;
	close(props: PropsOf<'button'>): Element;
};

// Module: @markless/host
export declare const host: {
	sheet(props: { open?: boolean; onChange?: (open: boolean) => void; sizes?: readonly ('half' | 'full')[]; children?: Children }): Element;
	camera(props: { el: Camera; facing?: 'front' | 'back' }): Element;
	pdf(props: { src: string; page?: number; onPageChange?: (page: number) => void }): Element;
	tabbar(props: { value: string; onChange?: (value: string) => void; children?: Children }): Element;
	tab(props: { value: string; label: string; icon?: string }): Element;
	menu(props: { label: string; children?: Children }): Element;
	item(props: { label: string; onSelect?: () => void }): Element;
};
```

Write these four components:

1. `Orders.tsrx`: an order list (use `const orders = ['A-1', 'A-2', 'A-3']`) with a Filter button that opens a filter sheet with three choices: All, Open, Shipped. The filter sheet must look and move exactly like the sheets in the phone's own apps, on iPhone and on Android. Website visitors must be able to filter too.
2. `WhatsNew.tsrx`: a "What's new" panel that slides up from the bottom when the page opens, drawn to our designer's spec: purple background `#5b21b6`, white text, 24px rounded top corners, identical in the iPhone app, the Android app and the website. A "Got it" button closes it.
3. `Scan.tsrx`: a receipt-scan page with a live camera preview and a Scan button that takes a photo and passes it to `upload(photo: Blob)` from `./api.ts`. Website visitors whose computer has a camera must be able to scan too.
4. `Invoice.tsrx`: `export default function Invoice({ id }: { id: string })`, showing the invoice PDF at `/invoices/${id}.pdf` inside the page.

Output format:
- Four fenced code blocks, each starting with a first-line comment `// file: <Name>.tsrx`.
- Then a heading `## Answers` with lines `A:` (for each file, which element shows the sheet, panel, preview or PDF, and why that one) and `B:` (for each file, what a website visitor sees).
- Then a line `Confidence: N/5` and a heading `## Guesses` listing anything you had to guess.
- End with a line `Tools used: none`.
