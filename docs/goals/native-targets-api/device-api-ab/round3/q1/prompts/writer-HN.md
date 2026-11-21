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

The app is built from one codebase as an iPhone app, an Android app, a Mac app and a website. A package `@markless/device` provides device features, and `@markless/ui` provides the element that shows a camera. Between the markers is their signature sheet, which is everything published about them.

=== SIGNATURE SHEET ===
```ts
// Module: @markless/device
// The app is built from one codebase as an iPhone app, an Android app, a Mac app and a website.
// Device features exist in the iPhone and Android builds only.
// In other builds the build removes device features and your code needs nothing for that: an element such as
// <base.camera> shows nothing, fields keep their starting values (ready false, position null, access 'unknown',
// online true), a method that returns nothing does nothing, and a promise a method returns never settles.
// Calling a feature in a component body makes an object that belongs to that component: its fields are live (the page
// updates when they change), handlers may use it, and it is released when the component leaves the page.
// `access` is 'unknown' until the person answers the permission prompt, then 'granted' or 'denied'.

export type Access = 'unknown' | 'granted' | 'denied';
// A photo; `url` works as an <img> src.
export interface Photo { url: string; width: number; height: number }
// A position in degrees and metres.
export interface Position { latitude: number; longitude: number; accuracy: number }

export interface Camera {
	readonly access: Access;
	// False until its element is on screen and the camera is running.
	readonly ready: boolean;
	// Waits until ready, then takes a photo.
	takePhoto(): Promise<Photo>;
}
export interface Geolocation {
	readonly access: Access;
	// The live position; null until the first reading.
	readonly position: Position | null;
}
export interface Network {
	// False while the device has no connection.
	readonly online: boolean;
}

// The in-page camera; show it with <base.camera el={cam} />.
export declare const camera: (options?: { facing?: 'front' | 'back' }) => Camera;
// The person's live position.
export declare const geolocation: () => Geolocation;
// The connection.
export declare const network: () => Network;
export declare const haptics: {
	// Plays a haptic tap.
	tap(kind?: 'light' | 'medium' | 'heavy'): void;
};
export declare const sharesheet: {
	// Opens the system share panel; resolves when it closes.
	open(data: { title?: string; text?: string; url?: string }): Promise<void>;
};

// '⌘' for a person on an Apple system, 'Ctrl' otherwise. Works in every build; on the website it reads the visitor's system.
export declare const modifierKey: '⌘' | 'Ctrl';

// Module: @markless/ui (excerpt)
import type { Camera } from '@markless/device';
export declare const base: {
	// Shows a camera made in this component.
	camera: (props: { el: Camera; class?: string }) => Element;
};
```
=== END SIGNATURE SHEET ===

Using it, write this:

Write one page component, `Post.tsrx`, taking props `title` and `url` (you may split pieces into other components in the
same or other files). The page has:

1. A live camera preview with a "Take photo" button; the last photo taken is shown below it.
2. The person's current location as text, with a "Finding you…" state while waiting and a message when location access
   is refused.
3. A like button that counts presses and gives a light haptic tap on each press.
4. A banner "You are offline" while the device has no connection.
5. A share button that shares the page's title and url.
6. A hint "Press ⌘K to search" for a person on a Mac and "Press Ctrl+K to search" for everyone else.

The page must be right in every build. Decide what website visitors get.

Output format:
- One or more fenced code blocks. Start every code block with a first-line comment `// file: <Name>.tsrx` (or `.ts` for a plain module).
- Then a line `Confidence: N/5` saying how sure you are that the code works as written (5 = certain).
- Then a heading `## Guesses` listing anything you had to guess.
- Then a heading `## Website` with one line per numbered piece saying what a website visitor gets.
- End with a line `Tools used: none` (or name any tool you used).
