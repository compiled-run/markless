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

The app runs on phones. A package `@markless/device` provides device features. Between the markers is its signature sheet, which is everything published about it.

=== SIGNATURE SHEET ===
```ts
// Module: @markless/device
// Each device that stays on is an object made by a function in a component body; the object belongs to that component,
// its fields are live, handlers may use it, and it is released when the component leaves the page.
// A feature that just answers once is a plain function.
// A refused permission is an Error whose name is 'NotAllowedError'. Nothing is declared in app config.

export type Facing = 'front' | 'back';
export type HapticKind = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

// A photo; `url` works as an <img> src.
export interface Photo { url: string; width: number; height: number }
// A position in degrees and metres.
export interface Position { latitude: number; longitude: number; accuracy: number }

export interface Camera {
	// False until its element is on screen and the camera is running.
	readonly ready: boolean;
	// True when camera access is refused.
	readonly denied: boolean;
	// Assign to flip.
	facing: Facing;
	// Waits until ready, then takes a photo.
	capture(): Promise<Photo>;
}
// The in-page camera.
export function camera(options?: { facing?: Facing }): Camera;

// The live position; `position` is null until the first reading.
export interface LocationWatch { readonly position: Position | null; readonly denied: boolean }
export function watchLocation(): LocationWatch;

export interface GeoMap {
	// Assign to move the map.
	center: { latitude: number; longitude: number };
	// A pin, written inside <mapview el={m}>.
	pin: (props: { at: { latitude: number; longitude: number } }) => Element;
}
export function mapview(options?: { center?: { latitude: number; longitude: number }; zoom?: number }): GeoMap;

// Opens the phone's own camera screen; resolves null if the person cancels.
export function takePhoto(): Promise<Photo | null>;
// One reading of the person's position.
export function currentPosition(): Promise<Position>;
// Opens the share sheet; resolves when it closes.
export function share(data: { title?: string; text?: string; url?: string }): Promise<void>;
// Plays a haptic tap.
export function haptic(kind?: HapticKind): void;
// Schedules a local notification; tapping it opens `url` in the app.
export function notify(options: { title: string; body?: string; at: Date; url: string }): Promise<void>;
// Opens this app's page in the phone's Settings.
export function openSettings(): void;

declare global {
	interface HTMLElementTagNameMap {
		// Shows a camera made in this component: <camera el={cam} />.
		camera: Camera;
		// Shows a map made in this component; put pins inside: <mapview el={m}>…</mapview>.
		mapview: GeoMap;
	}
}
```
=== END SIGNATURE SHEET ===

Using it, write the code for these seven tasks:

1. A button that opens the phone's own camera screen, then shows the photo taken.
2. Show the current location as text, read once: a loading state, and when access is refused a message with an "Open Settings" button and a "Try again" button.
3. A map that shows the person's live position as a pin that moves as they move.
4. A share button for the current article (title and url).
5. A like button that counts presses and gives a haptic tap on each press.
6. Schedule a local notification for an order one hour from now; tapping it opens that order's page (`/orders/42`).
7. A live in-page camera with a shutter button, plus a separate "Use system camera" button that opens the phone's own camera screen instead; show whichever photo was taken last.

Output format:
- For each task, a heading `## Task N`, then one or more fenced code blocks. Start every code block with a first-line comment `// file: taskN/<Name>.tsrx` (or `.ts` for a plain module).
- After each task's code, a line `Confidence: N/5` saying how sure you are that the code works as written (5 = certain).
- After the seven tasks, a heading `## Guesses` listing anything you had to guess.
- End with a line `Tools used: none` (or name any tool you used).