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

The app runs on phones. A package `@markless/device` provides device features, and `@markless/ui` provides the element that shows a camera. Between the markers is part of their signature sheet.

=== SIGNATURE SHEET ===
```ts
// Module: @markless/device
// Calling a feature in a component body makes an object that belongs to that component: its fields are live (the page
// updates when they change), handlers may use it, and it is released when the component leaves the page.
// A system screen is a noun you open from anywhere; it is not made in a component.
// A refused permission is an Error whose name is 'NotAllowedError'.

export type Access = 'unknown' | 'granted' | 'denied';
// A photo; `url` works as an <img> src.
export interface Photo { url: string; width: number; height: number }

export interface Camera {
	// 'unknown' until the person answers the permission prompt, then 'granted' or 'denied'.
	readonly access: Access;
	// False until its element is on screen and the camera is running.
	readonly ready: boolean;
	// Waits until ready, then takes a photo from this camera.
	takePhoto(): Promise<Photo>;
}
// The in-page camera; show it with <base.camera el={cam} />.
export declare function camera(options?: { facing?: 'front' | 'back' }): Camera;

export declare const settings: {
	// Opens this app's page in the phone's Settings.
	open(): void;
};
export declare const sharesheet: {
	// Opens the system share panel; resolves when it closes.
	open(data: { title?: string; text?: string; url?: string }): Promise<void>;
};

// Module: @markless/ui (excerpt)
import type { Camera } from '@markless/device';
export declare const base: {
	// Shows a camera made in this component.
	camera: (props: { el: Camera; class?: string }) => Element;
};
```
=== END SIGNATURE SHEET ===

Two system screens are left out of this sheet, and you must guess their names. Both follow the same pattern as `settings` and `sharesheet`:
- the phone's own camera screen, for taking a new photo;
- the phone's photo library, for choosing a photo that is already on the phone.

Write these:
1. A "Use phone camera" button that opens the phone's own camera screen and then shows the photo taken.
2. A "Choose a photo" button that lets the person pick an existing photo from the phone and then shows it.
3. One component with a live in-page camera and a shutter button; a "Use phone camera" button; a "Choose a photo" button; an "Open Settings" button shown when camera access is refused; and a "Share" button that shares the url of whichever photo was taken or chosen last.

Then answer:
A. The name you used for the camera screen, and two other names you would also find natural for it.
B. The name you used for the photo library, and two other names you would also find natural for it.
C. What you expect each of your two guessed screens to give back.

Output format:
- One or more fenced code blocks. Start every code block with a first-line comment `// file: <Name>.tsrx` (or `.ts` for a plain module).
- Then a line `Confidence: N/5` saying how sure you are that the code works as written (5 = certain).
- Then a heading `## Guesses` listing anything you had to guess.
- Then a heading `## Answers` with lines `A:`, `B:`, `C:`.
- End with a line `Tools used: none` (or name any tool you used).
