You are taking part in a study of API design. Answer from this prompt alone: do not read files, search the repository or any code, run commands, or use the web. Do not use any tools at all.

Markless is a UI framework whose components are written in `.tsrx` files. Below, between the markers, is the full Markless guidance you have.

=== MARKLESS GUIDANCE ===
# Markless agent playbook

Use this file as the guidance for the installed `@markless/core` version in the current project. Markless compiles `.tsrx` authoring into fine-grained DOM work; it does not use a virtual DOM, and component bodies never rerun in the browser: the page resumes from the server's HTML and loads code only when an event needs it.

## Authoring

- For async UI (`computed(async …)`, `@try`/`@pending`/`@catch`, saves and reloads), read `agent/async.md` in this package before the concept pages.
- Import the public authoring APIs (`state`, `computed`, `element`, `shared`, and `storage`) from `@markless/core`. Keep reactive component authoring in `.tsrx` files.
- Declare mutable state with `state(...)`, derived values with `computed(...)`, and update state with ordinary assignment. Do not introduce hooks, an effects system, or a client component rerender path.
- Persist reactive state with `storage(fallback)`. It reads and writes like ordinary state — reading the binding returns the value; assigning to it persists to `localStorage` (v1: strings only) and sets a `data-<key>` attribute on `<html>` for no-flash CSS. The compiler seeds the value before the framework wakes, so first paint is correct with no double read. By default the persistence key is **derived from the binding identifier**, namespaced: `let theme = storage('light')` persists under `markless:theme` (attr `data-markless-theme`). The derived key is a stable compile-time literal, so minification never changes it — but **renaming the binding changes the key and orphans existing users' saved data**. For anything you ship to real users, **pin an explicit key**, which is used verbatim and is rename-proof: `let theme = storage('theme', 'light')` persists under `theme`. Use derived keys for local/prototype state; pin explicit keys for durable user data. (A build-time rename-drift guard that warns when a derived key disappears is a planned fast-follow — see the framework's storage-ergonomics notes.)
- Use `element()` handles and `attach` behaviors for element lifetime work. Return cleanup from an attachment when it owns resources.
- Treat event arguments as native events. Inspect `event.target`; a deferred handler must not depend on `event.currentTarget` remaining populated.
- Prefer build diagnostics over guesses. If the compiler rejects an authored shape, change that shape instead of suppressing the gate.
- In tests, wait for an observable DOM result. A graph flush is not necessarily a DOM commit barrier.

## Run the project doctor

Run the app's `doctor` package script first for environment, dependency, and production-build failures. Follow the concrete failing check, then run the consuming application's own checks; framework package tests alone do not prove that an application still works.

## Analyzer and Witness evidence

Use the public exports from `@markless/analyzer` and, for browser collection, `@markless/analyzer/playwright`. Let the application own its route/action policy, budgets, and persisted receipts. Import validators, invariant identifiers, debug-channel sentinels, schemas, and report helpers from the analyzer package rather than copying their values.

Use analyzer results beside existing application assertions until they prove equivalent coverage. Convert Witness outcomes with `createWitnessVerdict`, then combine them through the analyzer's public verdict-report helpers. A missing or incompatible evidence source is a collection failure, not a passing result.

## Inspect the live debug channel

Use a debug-enabled development build and inspect `window.__MARKLESS_DEBUG__` in the running page. For a failed interaction, call its public `explainInteraction(element, eventType)` method on the actual DOM element before inferring a cause from source. Inspect the channel's public container and lifecycle data when the explanation points to ownership or disposal.

Do not copy channel protocol strings or configuration constants into application tooling. Import analyzer-owned facts from `@markless/analyzer`, and use the public debug surface exposed by the installed runtime.

## Diagnose resume failures

1. Reproduce against a production build as well as development.
2. Run the doctor and fix version skew or build failures first.
3. Use the analyzer's public payload-wiring and locator-resolution collectors to compare served payload claims, runtime registrations, and resolved DOM targets.
4. Use the preload-integrity and request-window helpers for code that arrives too late, and the debug-strip evaluator to distinguish debug-enabled evidence from an unflagged production artifact.
5. When testing explicit resume entry points, import the public resume helpers from `@markless/core` or its documented runtime entry points. Do not invent a rerender or a second run of component bodies as a recovery path.
6. Preserve the smallest failing application case and its receipts, then run that application's checks after the fix.


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

Do not keep class instances or functions in `state()`. Do not write `id={x!}` on a prop: pass `id={x}` and type the prop `number | null`.

## Runtime error: `render(App) requires a compiled TSRX artifact`

A `TypeError` from `render`, not a build error: the `.tsrx` file is empty or has no default export component.
=== END MARKLESS GUIDANCE ===

The app runs on phones. A package `@markless/device` provides device features. Between the markers is its signature sheet, which is everything published about it.

=== SIGNATURE SHEET ===
```ts
// Module: @markless/device
// A refused permission is an Error whose name is 'NotAllowedError'; a cancelled screen or sheet rejects with 'AbortError'. Nothing is declared in app config.

export type Facing = 'front' | 'back';

// A photo; `url` works as an <img> src.
export interface Photo { url: string; width: number; height: number }
// A position in degrees and metres.
export interface Position { latitude: number; longitude: number; accuracy: number }
// A recorded clip; `url` works as an <audio> src.
export interface Clip { url: string; durationMs: number }

// Opens the phone's own camera screen.
export function takePhoto(options?: { source?: 'camera' | 'library' }): Promise<Photo>;
// An attach behaviour that shows the live camera in a <video>: `<video attach={cameraPreview({ facing })} />`; it restarts when `facing` changes.
export function cameraPreview(options: { facing: Facing; onError?: (error: Error) => void }): (video: HTMLVideoElement) => () => void;
// Takes a photo from the preview running in a video bound with `let video = element<HTMLVideoElement>()` and `el={video}`.
export function capturePhoto(video: HTMLVideoElement | undefined): Promise<Photo>;

// One-time location reading.
export function getPosition(options?: { signal?: AbortSignal; highAccuracy?: boolean }): Promise<Position>;
// Opens this app's page in the phone's Settings.
export function openSettings(): Promise<void>;
// Plays a haptic tap.
export function haptic(style?: 'light' | 'medium' | 'heavy'): void;

// Calls back at once with the current status, then on each change; returns a stop function.
export function watchNetwork(callback: (status: { online: boolean }) => void): () => void;
// Calls back with each compass heading in degrees (0 = north); returns a stop function.
export function watchHeading(callback: (reading: { degrees: number }) => void): () => void;

// A recording in progress.
export interface Recording {
	// Stops and resolves with the clip.
	stop(): Promise<Clip>;
}
// Starts recording from the microphone.
export function startRecording(options?: { kind?: 'audio' }): Promise<Recording>;

// Schedules a local notification; tapping it opens `url` in the app.
export function scheduleNotification(options: { id: string; title: string; body?: string; at: Date; url: string }): Promise<void>;
// Opens the share sheet.
export function share(data: { title?: string; text?: string; url?: string }): Promise<void>;
```
=== END SIGNATURE SHEET ===

Using it, write the code for these eight tasks:

1. Button that opens the phone's own camera screen, then shows the photo taken.
2. Live camera preview inside the page, a shutter button, a button to switch front/back camera, the last photo shown below, and a message when camera access is refused.
3. Show the current location as text: a loading state, and when access is refused a message with an "Open Settings" button and a "Try again" button.
4. A like button that counts presses and gives a haptic tap on each press.
5. An "Offline" banner that appears and disappears as connectivity changes, plus the compass heading shown live.
6. Voice memo: start and stop recording, show elapsed seconds while recording, then play the clip back.
7. Schedule a local notification for an order; tapping the notification opens that order's page.
8. A share button for the current article (title and url).

Output format:
- For each task, a heading `## Task N`, then one or more fenced code blocks. Start every code block with a first-line comment `// file: taskN/<Name>.tsrx` (or `.ts` for a plain module, or the config/strings file name for a non-code file).
- After each task's code, a line `Confidence: N/5` saying how sure you are that the code works as written (5 = certain).
- After the eight tasks, a heading `## Guesses` listing anything you had to guess.
- End with a line `Tools used: none` (or name any tool you used).
