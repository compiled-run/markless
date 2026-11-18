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
// Show it with its element (see below).
export declare function camera(options?: { facing?: 'front' | 'back' }): Camera;

// Module: @markless/ui (excerpt)
import type { Camera } from '@markless/device';
// Families of parts with behaviour (keyboard, focus, state) and no styles. The author styles them from a stylesheet: each
// part's element carries `ui-*` attributes (for example `ui-pressed`, `ui-selected`) to style against.
type Div = { class?: string; children?: unknown };
export declare const tabs: {
	// The tabs. Holds which tab shows (`value`; omit it and none shows) and how the arrow keys walk.
	root: (props: Div & { value?: string; orientation?: 'horizontal' | 'vertical'; loop?: boolean; selectOnFocus?: boolean; onChange?: (value: string) => void }) => Element;
	// The row of tabs (role="tablist").
	list: (props: Div) => Element;
	// One tab; label content only. It shows the content part with the same `value`.
	trigger: (props: Div & { value: string; disabled?: boolean }) => Element;
	// One panel. It stays in the page when its tab is not showing.
	content: (props: Div & { value: string }) => Element;
};
export declare const base: {
	// A button. Give it `pressed` and it is a toggle button that flips on each press and calls onChange with the new
	// state; leave `pressed` off and it is a plain button with no state of its own.
	button: (props: { disabled?: boolean; pressed?: boolean; onChange?: (pressed: boolean) => void; children?: unknown }) => Element;
	// A plain <label>.
	label: (props: { for?: string; children?: unknown }) => Element;
	// A display separator.
	separator: (props: { orientation?: 'horizontal' | 'vertical'; decorative?: boolean }) => Element;
	// Content hidden from sight but still read by screen readers.
	visuallyhidden: (props: { children?: unknown }) => Element;
};

// Built into Markless (excerpt)
// The camera element and the PDF element have no HTML equivalent. Each is one box with no parts and no behaviour of its
// own. The author sizes and places the box with `class`; what is inside it is drawn by the device and cannot be styled:
// on iPhone and Android, the system's own camera preview and PDF view; on the website, the browser's camera picture and
// the browser's PDF viewer.
// The camera element shows a camera made with camera(). The PDF element shows one page of a PDF: `page` counts from 1,
// and `onLoad` is called once with the page count.
type CameraElementProps = { el: Camera; class?: string };
type PdfElementProps = { src: string; page?: number; onLoad?: (info: { pages: number }) => void; class?: string };
// Built into Markless: written like HTML elements, lowercase, with no import.
// <camera el={cam} />   <pdf src="…" />
declare global {
	namespace JSX {
		interface IntrinsicElements {
			camera: CameraElementProps;
			pdf: PdfElementProps;
		}
	}
}
```
=== END SIGNATURE SHEET ===

Using it, write this:

Write one page, `pages/media.tsrx` (you may split pieces into other components in the same file):

1. Two tabs, "Camera" and "Document", made with the `tabs` family; Camera shows first.
2. In Camera: a live camera preview; a shutter button that takes a photo and shows the last photo below the preview;
   and a flip button, made with `base.button`, that switches between the front and back cameras.
3. In Document: one page of `/guide.pdf` with a label such as "Page 3 of 12", and Previous and Next buttons.

Make the preview and the PDF page fill the width of their panel (any class names).

Output format:
- One or more fenced code blocks. Start every code block with a first-line comment `// file: <path>`.
- Then a line `Confidence: N/5` saying how sure you are that the code works as written (5 = certain).
- Then a heading `## Guesses` listing anything you had to guess.
- Then a heading `## Website` with one line each for the camera preview and the PDF page saying what a website visitor sees.
- End with a line `Tools used: none` (or name any tool you used).
