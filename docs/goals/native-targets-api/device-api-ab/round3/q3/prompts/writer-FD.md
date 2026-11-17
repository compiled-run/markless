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

The app runs on phones. A package `@markless/device` provides device features, and `@markless/ui` provides the element that shows a camera. Between the markers is their signature sheet, which is everything published about them.

=== SIGNATURE SHEET ===
```ts
// Module: @markless/device
// Calling a feature in a component body makes an object that belongs to that component: its fields are live (the page
// updates when they change), handlers may use it, and it is released when the component leaves the page.
// A system screen is opened by calling a function from anywhere; nothing is made in a component.
// A refused permission is an Error whose name is 'NotAllowedError'.

export type Access = 'unknown' | 'granted' | 'denied';
// A photo; `url` works as an <img> src.
export interface Photo { url: string; width: number; height: number }
export interface ShareData { title?: string; text?: string; url?: string }

export interface Camera {
	// 'unknown' until the person answers the permission prompt, then 'granted' or 'denied'.
	readonly access: Access;
	// False until its element is on screen and the camera is running.
	readonly ready: boolean;
	// Waits until ready, then takes a photo from this camera.
	takePhoto(): Promise<Photo>;
}
export declare const camera: {
	// The in-page camera; show it with <base.camera el={cam} />.
	(options?: { facing?: 'front' | 'back' }): Camera;
	// Opens the phone's own camera screen, for taking a new photo; resolves with the photo taken, or null if the person
	// cancels. Makes no in-page camera.
	takePhoto(): Promise<Photo | null>;
};
// Opens the phone's photo library, for choosing a photo already on the phone; resolves with it, or null if the person cancels.
export declare function choosePhoto(): Promise<Photo | null>;
// Opens this app's page in the phone's Settings.
export declare function openSettings(): void;
// Opens the system share panel; resolves when it closes.
export declare function openShareSheet(data: ShareData): Promise<void>;

// Module: @markless/ui (excerpt)
import type { Camera } from '@markless/device';
export declare const base: {
	// Shows a camera made in this component.
	camera: (props: { el: Camera; class?: string }) => Element;
};
```
=== END SIGNATURE SHEET ===

Using it, write one component, `PhotoStudio.tsrx`, with:
- a live in-page camera and a shutter button that takes a photo from it;
- a "Use phone camera" button that opens the phone's own camera screen to take a new photo;
- a "Choose a photo" button that lets the person pick a photo already on the phone;
- an "Open Settings" button, shown when camera access is refused, that opens the app's page in the phone's Settings;
- a "Share" button that shares the url of whichever photo was taken or chosen last; that photo is shown on the page.

Output format:
- One or more fenced code blocks. Start every code block with a first-line comment `// file: <Name>.tsrx` (or `.ts` for a plain module).
- Then a line `Confidence: N/5` saying how sure you are that the code works as written (5 = certain).
- Then a heading `## Guesses` listing anything you had to guess.
- Then a heading `## Calls` with one line each: the call that takes a photo from the in-page camera, the call that opens the phone's camera screen, the call that opens the photo library.
- End with a line `Tools used: none` (or name any tool you used).
