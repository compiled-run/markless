# Markless async reference

Async UI in `.tsrx`, for agents. This page is complete; read no other.

## Shape

```tsrx
import { computed, state } from '@markless/core';
import { getItems } from './api.ts';

export default function App() @{
	let query = state('');
	let picked = state<number | null>(null);
	const items = computed(async ({ signal }) => await getItems(query));

	<main>
		<input value={query} onInput={(event) => (query = event.currentTarget.value)} />
		@try {
			<ul>
				@for (const item of items; key item.id) {
					<li>
						<button onClick={() => (picked = item.id)}>{item.name}</button>
					</li>
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
		@if (picked !== null) {
			<Detail id={picked} />
		}
	</main>
}
```

- The body runs once: no hooks, effects, `onMount` or re-renders. Update state by assignment (`count++`).
- A component body is `@{ statements; one root element }`. Child components: `function Detail({ id }: { id: number }) @{ … }` in the same file or another `.tsrx`. Props follow the parent's state. A callback prop takes at most one parameter.
- Every `@try`, `@pending`, `@catch`, `@if`, `@else` and `@for` block holds exactly one node. Wrap siblings in an element or `<>…</>`.
- `@try` needs `@pending` or `@catch` (or both, in that order). `@catch` may name `(error)` or `(error, reset)`.
- An async computed is typed as its resolved value and is read only inside `@try`, including by handlers there.
- It runs again when any state it reads changes, before or after an `await`. Only the newest run's answer is shown; pass `signal` to `fetch` to abort the old one.
- Join several values in one template string: `{`Page ${p.page} of ${p.total}`}`.

## Markless does this for you; do not write it

- First load shows `@pending`. Later loads keep the old content on screen and put `aria-busy="true"` on it until the new answer is shown. Never write `aria-busy` yourself.
- A failed refresh keeps the old content and shows `@catch` after it. A failed first load shows only `@catch`. `reset` runs the failed loads again.
- After a handler's same-origin non-GET `fetch` (a save) succeeds, every async value on the page loads again once, old content kept and busy. Do not refetch yourself, and do not copy the save's answer into state to show it: the reload shows it. A failed save reloads nothing.
- `<form onSubmit={async (event) => { event.preventDefault(); … }}>`: while the promise runs, the form gets `aria-busy="true"` and its submit button `aria-disabled="true"`; a repeat press with the same values is ignored.
- A component inside an `@if` that closes drops its load; when it opens again it starts from `@pending`.
- A state a handler sets before its save (`saving = draft`) and clears after it keeps showing until the reload is on screen, so a "saving" row hands over to the saved row with no gap.
- Each component instance has its own state and loads.

## Patterns

Reload on demand: read a counter.

```tsrx
let reload = state(0);
const notes = computed(async () => {
	reload;
	return await getNotes();
});
<button onClick={() => reload++}>Refresh</button>
```

Keep a label matched to the data: return the input with the answer.

```tsrx
const page = computed(async () => {
	const n = pageNo;
	return { n, data: await getPage(n) };
});
// inside @try:
<p>{`Page ${page.n} of ${page.data.totalPages}`}</p>
```

A handler that awaits: catch into state (an uncaught error goes to the nearest `@catch`).

```tsrx
let failure = state('');
const add = async () => {
	failure = '';
	try {
		await createNote(draft);
		draft = '';
	} catch (error) {
		failure = (error as Error).message;
	}
};
<button onClick={add}>Add</button>
@if (failure) {
	<p>{failure}</p>
}
```

A save that a newer save replaces: keep the `AbortController` in a plain `.ts` file.

```ts
// src/latest.ts
let latest: AbortController | undefined;
export function replace(): AbortSignal {
	latest?.abort();
	latest = new AbortController();
	return latest.signal;
}
```

```tsrx
// import { replace } from './latest.ts'; call it in the handler
const save = async () => {
	const signal = replace();
	status = 'Saving…';
	try {
		await saveName(draft, signal);
		if (!signal.aborted) status = 'Saved';
	} catch (error) {
		if (signal.aborted) return;
		status = '';
		failure = (error as Error).message;
	}
};
```

One load per row: a row component with its own `computed` and `@try`.

```tsrx
function QuoteRow({ symbol }: { symbol: string }) @{
	const quote = computed(async () => await getQuote(symbol));
	<li>
		@try {
			<span>{`${quote.symbol}: ${quote.price}`}</span>
		} @pending {
			<span>Loading…</span>
		} @catch (error, reset) {
			<button onClick={reset}>{`Retry: ${error.message}`}</button>
		}
	</li>
}
// parent:
@for (const symbol of symbols; key symbol) {
	<QuoteRow symbol={symbol} />
}
```

## Build errors and what to write instead

| Code | Write instead |
| --- | --- |
| `MARKLESS_ASYNC_BOUNDARY_REQUIRED` | Move the read of the async value inside a `@try`. |
| `MARKLESS_BLOCK_SIBLING_NODES` | Wrap the block's nodes in one element or `<>…</>`. |
| `MARKLESS_STATE_MODULE_ESCAPE` | A module-level `let` a handler writes: use `state()` in the component, or put a value the page never shows (an `AbortController`) in a `.ts` file. |
| `MARKLESS_HANDLER_READS_RENDER_LOCAL` | A body `let` or `const` (not state) a handler uses: make it `state()`, or import it from a `.ts` file. |
| `MARKLESS_STATE_HELPER_RETURN_UNSUPPORTED` | A `.tsrx` helper returning a non-state value: move it to a `.ts` file. |
| `MARKLESS_ASYNC_ARIA_BUSY_MANAGED` | Remove your `aria-busy`; Markless sets it. |
| `MARKLESS_KEYED_REPEAT_ROW_CAN_BE_EMPTY` | A `@for` row that is a bare `@if`: filter the list in a `computed` instead. |
| `render(App) requires a compiled TSRX artifact` | The `.tsrx` file is empty or has no default export. |

Do not keep class instances or functions in `state()`. Do not write `id={x!}` on a prop: pass `id={x}` and type the prop `number | null`.
