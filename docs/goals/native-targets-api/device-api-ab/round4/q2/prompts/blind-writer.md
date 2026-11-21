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
// Module: @markless/router
// The app is built from one codebase as an iPhone app, an Android app and a website.
// An app is its `pages/` folder: `pages/index.tsrx` is `/`, `pages/orders.tsrx` is `/orders`, and
// `pages/orders/[id].tsrx` is `/orders/42` with `params.id === '42'`. Each page file default-exports its component.
// There are no layout files: a page renders everything on its screen.
// On iPhone and Android each route a person visits is a screen in the system's stack. A link pushes a new screen; the
// system Back (the back button, the edge swipe) pops it, and the screen below shows exactly as it was left.
// Each screen has its own state: it starts fresh when the screen is built and is kept while the screen is on the stack.
// Opening the app at a path from outside it (a link in another app, or a tapped push notification, whether or not the
// app was running) builds one screen for each leading part of the path that is a route, shortest first: `/orders/42`
// opens `/`, then `/orders`, then `/orders/42` on top, and Back walks up.
// A push notification carries a `path`, which the server sets when it sends it.
// On the website a link loads the page in place, and the browser's Back shows the previous page as the server sent it
// (its state starts over).

export interface PageProps<Params extends object = Record<string, string>> {
	readonly params: Readonly<Params>;
	readonly url: { readonly pathname: string; readonly search: string };
}
export interface NavigateOptions {
	// Put the new page in the current one's place instead of on top.
	readonly replace?: boolean;
}
// A link to a page of this app.
export declare function Link(props: { href: string; replace?: boolean; class?: string; children?: unknown }): Element;
// Goes to `path` exactly as a click on <Link href={path}> would.
export declare function navigate(path: string, options?: NavigateOptions): Promise<void>;
// The same as the person pressing Back.
export declare function back(): void;
// Code after a call to navigate() or back() in the same handler does not run.

// Module: @markless/core (excerpt: how state crosses screens)
// `state` and `shared` belong to one screen. Only `storage` crosses screens.
// A string kept on the device (on the website, in a cookie). Every screen that reads the same key sees the same value,
// and assigning to it updates every screen at once, including screens kept on the stack:
//   let session = storage('session', ''); … session = token;
export declare function storage(key: string, fallback: string): string;

// Module: @markless/device (excerpt)
// Which build this is, fixed when the app is built. In the website build it is 'web' whatever device the visitor uses.
// Platform differences in a page are checks of this value: `@if (platform === 'ios') { … }`.
export declare const platform: 'ios' | 'android' | 'web';

// Module: ./api.ts (already written in this app)
export interface Order { id: string; placedAt: string; total: number }
export interface Account { name: string; email: string }
export declare function getOrders(signal?: AbortSignal): Promise<Order[]>;
export declare function placeOrder(): Promise<Order>;
// Resolves to a session token.
export declare function signIn(): Promise<string>;
export declare function getAccount(session: string, signal?: AbortSignal): Promise<Account>;
```
=== END SIGNATURE SHEET ===

Nothing published makes a tab bar: the bar of tabs at the bottom of an iPhone or Android app, where each tab keeps its own stack of screens. Invent the smallest API you would expect Markless to have for it, in whatever form you think fits (a new package, a new export, a component, app config, a convention), and use it. Icons are named by strings such as 'house', 'bag' and 'person'.

Write the app's pages and anything else needed for these, in one app:
1. A tab bar on iPhone and Android with three tabs: Shop (`/`, icon 'house'), Orders (`/orders`, icon 'bag') and Account (`/account`, icon 'person').
2. A badge on the Orders tab showing the number of new orders. It goes up by one when the person places an order on `/checkout` (a "Place order" button that calls `placeOrder()`) and goes back to 0 when they open Orders.
3. `/checkout`, reached from a "Checkout" link on Shop, shows no tab bar.
4. The Account tab exists only while the person is signed in. They are signed in while the storage value `session` is not empty. `/signin` (a page with a "Sign in" button that calls `signIn()`) sets it. A signed-out person sees a "Sign in" link on Shop.

Decide what website visitors get for each.

Then answer:
A. In one sentence, the rule a developer must know to use your tab API.
B. Where else could the list of tabs have lived (app config, the pages' markup, each tab's route file, a component library)? Which did you pick, and why?
C. Where does the badge number come from, and how does the Orders tab learn it changed?
D. What would you edit to add a fourth tab?

Output format:
- A heading `## Invented API` with one fenced `ts` block: the signature of what you invented, with a one-line comment per item saying what it does.
- Then one or more fenced code blocks. Start every code block with a first-line comment `// file: <path>` (for example `// file: pages/cart.tsrx`).
- Then a line `Confidence: N/5` saying how sure you are that the code works as written, given your invented API (5 = certain).
- Then a heading `## Guesses` listing anything you had to guess.
- Then a heading `## Website` with one line per task saying what a website visitor gets.
- Then a heading `## Screens` with one line per route saying whether a phone shows the tab bar there.
- Then a heading `## Answers` with lines `A:` … `D:`.
- End with a line `Tools used: none` (or name any tool you used).
