# Markless async reference

Async UI in `.tsrx`, for agents. It covers async work only, not `@empty`, `@switch` or forms sent without a handler.

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

## Markless does this for you; do not write it

- First load shows `@pending`. Later loads keep the old content and put `aria-busy="true"` on it until the new answer shows. Never write `aria-busy`.
- A failed refresh keeps the old content and shows `@catch` after it; a failed first load shows only `@catch`. `reset` runs the failed loads again.
- After a save (a same-origin non-GET `fetch`) sent from a handler written in markup succeeds, every async value on the page loads again once, old content kept and busy. A `POST` read inside an async value is not reloaded. Do not refetch, and do not copy the save's answer into state to show it. A failed save reloads nothing.
- A state a handler sets before its first `await` (`saving = draft`) and clears after the save keeps showing until the reload is on screen, so a "saving" row hands over with no gap. Until that `await`, a handler reads what the page shows.
- `<form onSubmit={async (event) => { event.preventDefault(); … }}>` gets `aria-busy="true"` and its submit button `aria-disabled="true"` until the promise settles, or until the reload after a successful save lands. Repeat presses are ignored only for the same values from the same button, and not on a page's first submit.
- A component inside an `@if` that closes drops its load; opened again, it starts from `@pending`.

## Patterns

A label that matches the data: return the input with the answer.

```tsrx
import { computed, state } from '@markless/core';
import { getPage } from './api.ts';

export default function Pager() @{
	let pageNo = state(1);
	const page = computed(async () => {
		const n = pageNo;
		return { n, data: await getPage(n) };
	});

	<section>
		@try {
			<p>{`Page ${page.n} of ${page.data.totalPages}`}</p>
		} @pending {
			<p>Loading…</p>
		}
		<button onClick={() => pageNo++}>Next</button>
	</section>
}
```

A save from a handler, newer saves replacing older ones. Keep the `AbortController` in a plain `.ts` file and import the function; call it inside the handler. An error the handler does not catch goes to the nearest `@catch` when the button is inside a `@try`. A promise the handler neither returns nor awaits is not watched.

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
import { state } from '@markless/core';
import { saveName } from './api.ts';
import { replace } from './latest.ts';

export default function Name() @{
	let draft = state('');
	let status = state('');
	const save = async () => {
		const signal = replace();
		status = 'Saving…';
		try {
			await saveName(draft, signal);
			if (!signal.aborted) status = 'Saved';
		} catch (error) {
			if (!signal.aborted) status = (error as Error).message;
		}
	};

	<section>
		<input value={draft} onInput={(event) => (draft = event.currentTarget.value)} />
		<button onClick={save}>Save</button>
		@if (status) {
			<p>{status}</p>
		}
	</section>
}
```

## Build errors and what to write instead

| Code | Write instead |
| --- | --- |
| `MARKLESS_ASYNC_BOUNDARY_REQUIRED` | Read the async value inside a `@try`. |
| `MARKLESS_BLOCK_SIBLING_NODES` | Wrap the block's nodes in one element or `<>…</>`. |
| `MARKLESS_STATE_MODULE_ESCAPE` | A module-level `let` a handler writes: use `state()` in the component, or put a value the page never shows (an `AbortController`) in a `.ts` file. |
| `MARKLESS_HANDLER_READS_RENDER_LOCAL` | A body local a handler reads that is neither `state()` nor a `const` built only from props, state or module values: make it `state()`, or import it from a `.ts` file. |
| `MARKLESS_STATE_HELPER_RETURN_UNSUPPORTED` | A helper that makes `state()` or `computed()`: return the binding directly, or declare it in the component body. |
| `MARKLESS_ASYNC_ARIA_BUSY_MANAGED` | Remove your `aria-busy`; Markless sets it. |

Do not keep class instances or functions in `state()`.

## Runtime error: `render(App) requires a compiled TSRX artifact`

A `TypeError` from `render`, not a build error: the `.tsrx` file is empty or has no default export component.
