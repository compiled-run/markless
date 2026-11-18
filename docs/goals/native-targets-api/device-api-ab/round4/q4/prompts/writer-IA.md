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

The app is built from one codebase as an iPhone app, an Android app and a website. Between the markers is the signature sheet of the packages it uses, which is everything published about them.

=== SIGNATURE SHEET ===
```ts
// Module: @markless/device (excerpt)
export type Access = 'unknown' | 'granted' | 'denied';
// A photo; `url` works as an <img> src.
export interface Photo { url: string; width: number; height: number }
export interface Camera {
	// 'unknown' until the person answers the permission prompt.
	readonly access: Access;
	// False until its element is on screen and the camera is running.
	readonly ready: boolean;
	readonly facing: 'front' | 'back';
	// Switches between the front and back cameras.
	flip(): void;
	// Waits until ready, then takes a photo.
	takePhoto(): Promise<Photo>;
}
// A camera that belongs to this component: its fields are live, and it is released when the component leaves the page.
export declare function camera(options?: { facing?: 'front' | 'back' }): Camera;
// Which build this is, fixed when the app is built: exactly one field is true. In the website build `web` is true
// whatever device the visitor uses. Platform differences in a page are checks of these: `@if (platform.ios) { … }`.
export declare const platform: {
	readonly ios: boolean;
	readonly android: boolean;
	readonly web: boolean;
};

// Module: @markless/ui (excerpt)
// Families of parts with behaviour (keyboard, focus, state) and no styles. The author styles them from a stylesheet: each
// part's element carries `ui-*` attributes (for example `ui-open`) to style against.
type Div = { class?: string; children?: unknown };
export declare const base: {
	// A button. Give it `pressed` and it is a toggle button that flips on each press and calls onChange with the new
	// state; leave `pressed` off and it is a plain button with no state of its own.
	button: (props: { disabled?: boolean; pressed?: boolean; onChange?: (pressed: boolean) => void; children?: unknown }) => Element;
};
// A panel that slides in from an edge and can be dragged closed (the bottom edge unless `orientation`/`start` say
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

// Two elements whose inside the system draws.
// The camera element shows a camera made with camera(). It is one box: the author sizes and places it with `class`; the
// picture inside is drawn by the device.
// The sheet element is the system's own sheet: a panel that slides up from the bottom over the screen. The system draws
// the panel, its grab handle, its corners and its animation, and closes it on a swipe down (calling onChange(false)).
// The author's children go inside it; the panel itself takes no class.
// On the website the camera element shows the browser's camera picture, and the sheet element is the browser's own
// <dialog>, shown at the bottom of the window with the browser's default look.
type CameraElementProps = { el: Camera; class?: string };
type SheetProps = { open?: boolean; onChange?: (open: boolean) => void; children?: unknown };
// Each build has its own namespace: ios.* exists only in the iPhone build, android.* only in the Android build and web.*
// only in the website build. Each must sit inside the matching `@if (platform.ios)` (or .android, .web); the build
// rejects it anywhere else.
// The iPhone's own elements.
export declare const ios: {
	// <ios.camera el={cam} />
	camera: (props: CameraElementProps) => Element;
	// <ios.sheet open={…} onChange={…}>…</ios.sheet>
	sheet: (props: SheetProps) => Element;
};
// Android's own elements.
export declare const android: {
	// <android.camera el={cam} />
	camera: (props: CameraElementProps) => Element;
	// <android.sheet open={…} onChange={…}>…</android.sheet>
	sheet: (props: SheetProps) => Element;
};
// The website's own elements (the browser's camera picture and <dialog>).
export declare const web: {
	// <web.camera el={cam} />
	camera: (props: CameraElementProps) => Element;
	// <web.sheet open={…} onChange={…}>…</web.sheet>
	sheet: (props: SheetProps) => Element;
};
```
=== END SIGNATURE SHEET ===

Using it, write this:

Write one page, `pages/capture.tsrx` (you may split pieces into other components in the same file):

1. A live camera preview that fills the page width, a shutter button that takes a photo and shows the last photo
   below the preview, and a flip button, made with `base.button`, that switches between the front and back cameras.
2. A "Filters" button that opens the system sheet. The sheet has the heading "Choose a filter" and three choices:
   None, Mono and Warm. Choosing one closes the sheet and shows "Filter: Mono" (or the chosen name) under the preview.
3. A "Comments" button that opens a drawer made with the `drawer` family, with the title "Comments", a list of three
   short comments of your choice, and a Close button.
4. In the iPhone app only, the note "Photos also save to your library."

Output format:
- One or more fenced code blocks. Start every code block with a first-line comment `// file: <path>`.
- Then a line `Confidence: N/5` saying how sure you are that the code works as written (5 = certain).
- Then a heading `## Guesses` listing anything you had to guess.
- Then a heading `## Website` with one line each for the camera preview, the Filters sheet, the Comments drawer and the note, saying what a website visitor gets.
- Then a heading `## Places` with lines `A:` (how many places in your code you would edit to add a fourth filter, and which) and `B:` (the same, to change the heading "Choose a filter").
- End with a line `Tools used: none` (or name any tool you used).
